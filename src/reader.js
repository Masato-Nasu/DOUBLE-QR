import jsQR from 'jsqr';
import {readBarcodes,prepareZXingModule,ZXING_WASM_VERSION} from 'zxing-wasm/reader';
import {readGrid,N} from './core.js';
import {readGridPacked} from './packed.js';
import {readGridLarge,LARGE_N} from './large.js';
import {readPadding} from './pad-channel.js';
import {PAD_N} from './pad-matrix.js';
export const DECODERS={zxing:'ZXing WASM '+ZXING_WASM_VERSION,jsqr:'jsQR 1.4.0'};
export function configureReader(overrides){prepareZXingModule({overrides});}
export function decodeJS(image){
 const r=jsQR(image.data,image.width,image.height,{inversionAttempts:'attemptBoth'});
 if(!r)return null;const p=r.location;return {public:r.data,corners:[p.topLeftCorner,p.topRightCorner,p.bottomRightCorner,p.bottomLeftCorner],decoder:'jsQR'};
}
export async function decodeZX(image){
 const r=(await readBarcodes(image,{formats:['QRCode'],tryHarder:true,maxNumberOfSymbols:1}))[0];
 if(!r||r.error)return null;const p=r.position;return {public:r.text,corners:[p.topLeft,p.topRight,p.bottomRight,p.bottomLeft],decoder:'ZXing'};
}
export async function decodeBoth(image){
 const errors={};let zxing=null,jsqr=null;
 try{zxing=await decodeZX(image);}catch(e){errors.zxing=e.message;}
 try{jsqr=decodeJS(image);}catch(e){errors.jsqr=e.message;}
 return {zxing,jsqr,errors};
}
export function project(corners,u,v){
 const [p0,p1,p2,p3]=corners,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
 const den=dx1*dy2-dx2*dy1;if(Math.abs(den)<1e-9)throw Error('QRの位置を確認できません。');
 const g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den;
 return {x:((p1.x-p0.x+g*p1.x)*u+(p3.x-p0.x+h*p3.x)*v+p0.x)/(g*u+h*v+1),y:((p1.y-p0.y+g*p1.y)*u+(p3.y-p0.y+h*p3.y)*v+p0.y)/(g*u+h*v+1)};
}
function grayImage(image){const gray=new Uint8Array(image.width*image.height),hist=new Uint32Array(256);let sum=0;for(let i=0;i<gray.length;i++){gray[i]=Math.round(image.data[i*4]*.299+image.data[i*4+1]*.587+image.data[i*4+2]*.114);hist[gray[i]]++;sum+=gray[i];}let weight=0,sumB=0,max=-1,threshold=128;for(let t=0;t<256;t++){weight+=hist[t];if(!weight)continue;const wF=gray.length-weight;if(!wF)break;sumB+=t*hist[t];const between=weight*wF*(sumB/weight-(sum-sumB)/wF)**2;if(between>max){max=between;threshold=t;}}return {gray,threshold};}
export function sampleGrid(image,corners,thresholdOverride,n=N,prepared=null){
 const {gray,threshold}=prepared??grayImage(image),cut=thresholdOverride??threshold,{width,height}=image,grid=new Uint8Array(n*n);
 const value=(x,y)=>{x=Math.max(0,Math.min(width-1,x));y=Math.max(0,Math.min(height-1,y));const a=Math.floor(x),b=Math.floor(y),dx=x-a,dy=y-b;const p=(ix,iy)=>gray[Math.min(height-1,iy)*width+Math.min(width-1,ix)];return p(a,b)*(1-dx)*(1-dy)+p(a+1,b)*dx*(1-dy)+p(a,b+1)*(1-dx)*dy+p(a+1,b+1)*dx*dy;};
 for(let r=0;r<n;r++)for(let c=0;c<n;c++){const patches=[];for(const dy of [-.1,0,.1])for(const dx of [-.1,0,.1]){const p=project(corners,(c+.5+dx)/n,(r+.5+dy)/n);patches.push(value(p.x,p.y));}patches.sort((a,b)=>a-b);grid[r*n+c]=+(patches[4]<=cut);}
 return grid;
}
// Camera images often contain module-level errors even when the normal QR
// decoder repairs the public payload. Combine several independently sampled
// camera frames before authenticating the hidden payload. The stream is kept
// only in memory and is reset whenever the detected public QR changes.
export function createCameraAccumulator(){
 const make=()=>new Map([N,LARGE_N,PAD_N].map(n=>[n,[new Int16Array(n*n),new Int16Array(n*n)]]));
 let publicText='',count=0,totals=make();
 const reset=()=>{publicText='';count=0;totals=make();};
 const majority=(votes)=>Uint8Array.from(votes,v=>v>0?1:0);
 const add=(image,code)=>{
  if(!code?.public||!code.corners)throw Error('表のQR位置を取得できません。');
  if(publicText!==code.public){reset();publicText=code.public;}
  if(count>=24){for(const sets of totals.values())for(const t of sets)for(let i=0;i<t.length;i++)t[i]=Math.trunc(t[i]/2);count=12;}
  const prepared=grayImage(image);
  for(const [n,sets] of totals)for(const [j,threshold] of [undefined,128].entries()){
   const grid=sampleGrid(image,code.corners,threshold,n,prepared);
   for(let i=0;i<grid.length;i++)sets[j][i]+=grid[i]?1:-1;
  }
  count++;
  return count;
 };
 const recover=async(key,repetitions='auto')=>{
  if(!publicText||count<2)throw Error('画像の蓄積が必要です。');
  const reps=repetitions==='auto'?[1,3,5]:[Number(repetitions)];
  for(const votes of totals.get(N)){
   const grid=majority(votes);
   for(const rep of reps)for(const decode of [readGridPacked,readGrid]){
    try{return await decode(publicText,grid,key,rep);}catch{}
   }
  }
  for(const votes of totals.get(LARGE_N)){
   const grid=majority(votes);
   for(const rep of reps)try{return await readGridLarge(publicText,grid,key,rep);}catch{}
  }
  for(const votes of totals.get(PAD_N)){
   try{return await readPadding(publicText,majority(votes),key);}catch{}
  }
  throw Error('裏を復元できませんでした。');
 };
 return{add,recover,reset,get count(){return count;},get publicText(){return publicText;}};
}
export async function recover(image,key,repetitions='auto',decoded){
 if(!key)throw Error('生成時の鍵を入力してください。');
 const codes=decoded||await decodeBoth(image),candidates=[codes.zxing,codes.jsqr].filter(Boolean);
 if(!candidates.length)throw Error('表のQRを読み取れません。QR全体を大きく、正面から撮影してください。');
 const prepared=grayImage(image);
 for(const code of candidates)for(const threshold of [undefined,128]){
  const grid=sampleGrid(image,code.corners,threshold,N,prepared);
  for(const rep of repetitions==='auto'?[1,3,5]:[Number(repetitions)])for(const decode of [readGridPacked,readGrid])try{return await decode(code.public,grid,key,rep);}catch{}
  const largeGrid=sampleGrid(image,code.corners,threshold,LARGE_N,prepared);
  for(const rep of repetitions==='auto'?[1,3,5]:[Number(repetitions)])try{return await readGridLarge(code.public,largeGrid,key,rep);}catch{}
  const padGrid=sampleGrid(image,code.corners,threshold,PAD_N,prepared);
  try{return await readPadding(code.public,padGrid,key);}catch{}
 }
 throw Error('表は読めましたが、裏を復元できません。鍵を確認し、画像を大きくするか正面から撮り直してください。');
}
export async function verify(image,publicText,hidden,key,rep,expectedVersion=null){
 const codes=await decodeBoth(image);
 let recovered=false;
 if(expectedVersion===36){
  const prepared=grayImage(image);
  for(const code of [codes.zxing,codes.jsqr].filter(Boolean)){
   for(const threshold of [undefined,128]){
    try{
     const r=await readPadding(code.public,sampleGrid(image,code.corners,threshold,PAD_N,prepared),key);
     if(r.public===publicText&&r.hidden===hidden){recovered=true;break;}
    }catch{}
   }
   if(recovered)break;
  }
 }else{
  try{const r=await recover(image,key,rep,codes);recovered=r.public===publicText&&r.hidden===hidden;}catch{}
 }
 return {zxing:codes.zxing?.public===publicText,jsqr:codes.jsqr?.public===publicText,hidden:recovered,errors:codes.errors};
}

import QRCode from 'qrcode/lib/core/qrcode.js';
export const VERSION=12, N=65, MASK=0, REPS=[1,3,5];
const encoder=new TextEncoder(), decoder=new TextDecoder('utf-8',{fatal:true});
export const utf8=s=>encoder.encode(s);
export const concat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
export async function sha256(data){return new Uint8Array(await crypto.subtle.digest('SHA-256',data));}
async function hmac(key,data){return new Uint8Array(await crypto.subtle.sign('HMAC',key,data));}
export function plainQR(publicText){
 if(!publicText.trim())throw Error('表の内容を入力してください。');
 if(utf8(publicText).length>150)throw Error('表の内容はUTF-8で150バイト以内にしてください。');
 const mode=/^[0-9]+$/.test(publicText)?'numeric':/^[0-9A-Z $%*+./:\-]+$/.test(publicText)?'alphanumeric':'byte';
 const q=QRCode.create([{data:publicText,mode}],{version:VERSION,errorCorrectionLevel:'H',maskPattern:MASK});
 return {matrix:Uint8Array.from(q.modules.data),reserved:Uint8Array.from(q.modules.reservedBit)};
}
const template=plainQR('HELLO');
export const SLOTS=Array.from({length:N*N},(_,i)=>i).filter(i=>!template.reserved[i]);
// CPython random.Random(int_seed): MT19937 init_by_array + getrandbits shuffle.
class PythonRandom{
 constructor(words){
  this.mt=new Uint32Array(624);this.mt[0]=19650218;
  for(let i=1;i<624;i++)this.mt[i]=(Math.imul(1812433253,this.mt[i-1]^(this.mt[i-1]>>>30))+i)>>>0;
  let i=1,j=0;
  for(let k=Math.max(624,words.length);k;k--){this.mt[i]=((this.mt[i]^Math.imul(this.mt[i-1]^(this.mt[i-1]>>>30),1664525))+words[j]+j)>>>0;i++;j++;if(i>=624){this.mt[0]=this.mt[623];i=1;}if(j>=words.length)j=0;}
  for(let k=623;k;k--){this.mt[i]=((this.mt[i]^Math.imul(this.mt[i-1]^(this.mt[i-1]>>>30),1566083941))-i)>>>0;i++;if(i>=624){this.mt[0]=this.mt[623];i=1;}}
  this.mt[0]=0x80000000;this.index=624;
 }
 uint32(){
  if(this.index>=624){for(let i=0;i<624;i++){const y=(this.mt[i]&0x80000000)|(this.mt[(i+1)%624]&0x7fffffff);this.mt[i]=(this.mt[(i+397)%624]^(y>>>1)^((y&1)?0x9908b0df:0))>>>0;}this.index=0;}
  let y=this.mt[this.index++];y^=y>>>11;y^=(y<<7)&0x9d2c5680;y^=(y<<15)&0xefc60000;y^=y>>>18;return y>>>0;
 }
 below(n){const k=32-Math.clz32(n);let r;do{r=this.uint32()>>>(32-k);}while(r>=n);return r;}
}
export async function positions(publicText,key,rep=1){
 const seed=await sha256(concat(utf8('DQR-v1-positions'),utf8(publicText),utf8(key)));const words=[];
 for(let i=28;i>=0;i-=4)words.push(((seed[i]<<24)|(seed[i+1]<<16)|(seed[i+2]<<8)|seed[i+3])>>>0);
 // CPython excludes leading zero words when converting an integer.
 while(words.length>1&&words.at(-1)===0)words.pop();
 const random=new PythonRandom(words), original=SLOTS.slice();
 for(let i=original.length-1;i>0;i--){const j=random.below(i+1);[original[i],original[j]]=[original[j],original[i]];}
 if(rep===1)return original;
 const groups=new Map(),perBlock=Array.from({length:11},()=>[]),remainder=[];
 for(const rc of original){const item=WORD_MAP.get(rc);if(!item){remainder.push(rc);continue;}const [cw,block]=item;if(!groups.has(cw)){groups.set(cw,[]);perBlock[block].push(cw);}groups.get(cw).push(rc);}
 const result=[];for(let i=0;i<Math.max(...perBlock.map(x=>x.length));i++)for(const words of perBlock)if(i<words.length)result.push(...groups.get(words[i]));return result.concat(remainder);
}
// V12/H: 7 RS blocks with 14 data words and 4 with 15; each has 28 parity words.
export const BLOCKS=Array.from({length:11},(_,i)=>({data:i<7?14:15,total:i<7?42:43,limit:14}));
function codewordMap(){
 const slots=new Set(SLOTS),ordered=[];let row=N-1,direction=-1;
 for(let c0=N-1;c0>0;c0-=2){const col=c0<=6?c0-1:c0;while(true){for(const c of [col,col-1])if(slots.has(row*N+c))ordered.push(row*N+c);row+=direction;if(row<0||row>=N){row-=direction;direction=-direction;break;}}}
 const blocks=[];for(let i=0;i<15;i++)BLOCKS.forEach((b,j)=>{if(i<b.data)blocks.push(j);});for(let i=0;i<28;i++)BLOCKS.forEach((_,j)=>blocks.push(j));
 const result=new Map();ordered.forEach((rc,i)=>{if((i>>3)<blocks.length)result.set(rc,[i>>3,blocks[i>>3]]);});return result;
}
export const WORD_MAP=codewordMap();
export function budget(plain,modified){
 const affected=BLOCKS.map(()=>new Set());let changed=0;
 for(let i=0;i<plain.length;i++)if(plain[i]!==modified[i]){changed++;const item=WORD_MAP.get(i);if(item)affected[item[1]].add(item[0]);}
 const blocks=BLOCKS.map((b,i)=>({block:i+1,changed_codewords:affected[i].size,correction_limit:b.limit,remaining:b.limit-affected[i].size}));
 return {changed_modules:changed,changed_percent:changed/(N*N)*100,min_remaining:Math.min(...blocks.map(x=>x.remaining)),budget_ok:blocks.every(x=>x.remaining>=2),blocks};
}
export async function keys(publicText,key,n){
 const material=await crypto.subtle.importKey('raw',utf8(key),'PBKDF2',false,['deriveBits']);
 const raw=await crypto.subtle.deriveBits({name:'PBKDF2',salt:utf8('DQR-v1'+publicText),iterations:100000,hash:'SHA-256'},material,256);
 const mac=await crypto.subtle.importKey('raw',raw,{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const chunks=[];for(let i=0;i<Math.ceil(n/32);i++){const number=new Uint8Array(4);new DataView(number.buffer).setUint32(0,i);chunks.push(await hmac(mac,concat(utf8('stream'),number)));}
 return {stream:concat(...chunks).slice(0,n),mac};
}
export async function packetBytes(publicText,body,key){
 if(!body.length||body.length>255)throw Error('保存する裏データは1〜255バイトにしてください。実際の容量は検査で決まります。');
 const {stream,mac}=await keys(publicText,key,body.length),enc=body.map((v,i)=>v^stream[i]),length=Uint8Array.of(body.length);
 const tag=(await hmac(mac,concat(utf8('tag'),utf8(publicText),length,enc))).slice(0,8);
 return concat(length,enc,tag);
}
export async function packet(publicText,hidden,key){
 return packetBytes(publicText,utf8(hidden),key);
}
export async function build(publicText,hidden,key,rep=1){
 if(!key)throw Error('鍵を入力してください。');if(key.length>1024)throw Error('鍵が長すぎます。');if(!REPS.includes(rep))throw Error('強度の値が不正です。');
 const plain=plainQR(publicText).matrix,modified=plain.slice(),raw=await packet(publicText,hidden,key),loc=await positions(publicText,key,rep),width=raw.length*8;
 if(width*rep>loc.length)throw Error('この強度では容量を超えています。裏の文字を減らしてください。');
 for(let k=0;k<rep;k++)for(let i=0;i<width;i++)modified[loc[k*width+i]]=(raw[i>>3]>>(7-i%8))&1;
 return {plain,matrix:modified,budget:budget(plain,modified),publicText,hiddenBytes:utf8(hidden).length,repetitions:rep};
}
export async function readGrid(publicText,grid,key,rep=1){
 if(!key)throw Error('鍵を入力してください。');if(!REPS.includes(rep))throw Error('生成時と同じ強度を指定してください。');
 const loc=await positions(publicText,key,rep),bits=loc.map(i=>grid[i]);
 const first=bits.slice(0,8).reduce((n,b)=>(n<<1)|b,0),max=Math.min(255,Math.floor(loc.length/(8*rep))-9);
 const candidates=rep===1?[first]:Array.from({length:max},(_,i)=>i+1);
 for(const len of candidates){
  const width=(len+9)*8;if(len<1||len>max)continue;const raw=new Uint8Array(len+9);
  for(let i=0;i<width;i++){let sum=0;for(let k=0;k<rep;k++)sum+=bits[k*width+i];if(sum>rep/2)raw[i>>3]|=1<<(7-i%8);}
  if(raw[0]!==len)continue;const enc=raw.slice(1,len+1),tag=raw.slice(len+1),{stream,mac}=await keys(publicText,key,len);
  const expected=(await hmac(mac,concat(utf8('tag'),utf8(publicText),Uint8Array.of(len),enc))).slice(0,8);let difference=0;for(let i=0;i<8;i++)difference|=tag[i]^expected[i];if(difference)continue;
  try{return {public:publicText,hidden:decoder.decode(enc.map((b,i)=>b^stream[i])),repetitions:rep};}catch{}
 }
 throw Error('裏を復元できませんでした。鍵・強度・画像の鮮明さを確認してください。');
}
export function pixels(matrix,scale=14,border=6){const n=Math.sqrt(matrix.length);if(!Number.isInteger(n))throw Error('不正なQR行列サイズです。');const size=(n+border*2)*scale,data=new Uint8ClampedArray(size*size*4);data.fill(255);for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(matrix[r*n+c])for(let y=(r+border)*scale;y<(r+border+1)*scale;y++)for(let x=(c+border)*scale;x<(c+border+1)*scale;x++){const i=(y*size+x)*4;data[i]=data[i+1]=data[i+2]=0;}return {width:size,height:size,data};}
export function features(a){let black=0,h=0,v=0,u=0;for(let r=0;r<N;r++)for(let c=0;c<N;c++){const x=a[r*N+c];black+=x;if(c<N-1)h+=+(x!==a[r*N+c+1]);if(r<N-1)v+=+(x!==a[(r+1)*N+c]);if(r<N-1&&c<N-1)u+=+(x===a[r*N+c+1]&&x===a[(r+1)*N+c]&&x===a[(r+1)*N+c+1]);}return [black/(N*N),h/(N*(N-1)),v/(N*(N-1)),u/((N-1)**2)];}

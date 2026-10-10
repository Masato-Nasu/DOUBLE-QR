import {build,plainQR,pixels,features,SLOTS,utf8} from './core.js';
import {decodeBoth,recover,DECODERS} from './reader.js';
export const pause=()=>new Promise(r=>setTimeout(r,0));
export const CASES=['original','resize','blur','jpeg','perspective','noise'];
export const LABELS={original:'元PNG',resize:'縮小',blur:'ぼかし',jpeg:'JPEG',perspective:'遠近変形',noise:'ノイズ'};
function rng(seed){let x=seed>>>0;return()=>{x+=0x6d2b79f5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function metadata(kind,seed){return{kind,version:'0.4-pwa',evidence:'ブラウザ内の合成画像テスト。スマートフォン標準カメラの実機測定ではありません。',measured_at:new Date().toISOString(),seed,decoders:DECODERS,rng:'mulberry32',notes:['PWAはZXing WASMとjsQRを使用。Python版OpenCVの数値とは別の測定です。','元PNGの反復は同じ画像であり、独立標本ではありません。','表（デコーダー別）・裏・厳格合格を分けています。','固定seedで再現。画像変形はPWA独自の定義で、v0.4とは同一条件ではありません。']};}
export function rate(values){const n=values.length,s=values.filter(Boolean).length,p=n?s/n:0,z=1.96,d=1+z*z/n;return{success:s,trials:n,percent:n?100*s/n:null,wilson95:n?[(p+z*z/(2*n)-z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d,(p+z*z/(2*n)+z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n)))/d]:null};}
function image(data){return new ImageData(data.data,data.width,data.height);}
export function paramsFor(caseName,seed){const random=rng(seed);switch(caseName){case'original':return{};case'resize':return{pixels:210+Math.floor(random()*211)};case'blur':return{radius:.7+random()*2.1};case'jpeg':return{pixels:260+Math.floor(random()*161),quality:.25+random()*.5};case'noise':return{pixels:280,sigma:8+random()*32};case'perspective':return{pixels:420,inset:10+random()*25};default:throw Error('条件が不正です。');}}
function resized(source,size){const out=new Uint8ClampedArray(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++){const sy=(y+.5)*source.height/size-.5,sx=(x+.5)*source.width/size-.5,x0=Math.max(0,Math.floor(sx)),y0=Math.max(0,Math.floor(sy)),fx=Math.max(0,sx-x0),fy=Math.max(0,sy-y0);for(let c=0;c<4;c++){const at=(ix,iy)=>source.data[(Math.min(iy,source.height-1)*source.width+Math.min(ix,source.width-1))*4+c];out[(y*size+x)*4+c]=at(x0,y0)*(1-fx)*(1-fy)+at(x0+1,y0)*fx*(1-fy)+at(x0,y0+1)*(1-fx)*fy+at(x0+1,y0+1)*fx*fy;}}return new ImageData(out,size,size);}
export async function transform(source,caseName,params,seed){
 let current=params.pixels?resized(source,params.pixels):new ImageData(new Uint8ClampedArray(source.data),source.width,source.height);
 if(caseName==='noise'){const random=rng(seed),d=current.data;for(let i=0;i<d.length;i+=4){const noise=Math.sqrt(-2*Math.log(Math.max(1e-9,random())))*Math.cos(2*Math.PI*random())*params.sigma;for(let c=0;c<3;c++)d[i+c]=Math.min(255,Math.max(0,d[i+c]+noise));}return current;}
 if(caseName==='perspective'){
  const {width:w,height:h,data}=current,out=new Uint8ClampedArray(data.length);out.fill(255);
  // True projective inverse mapping: narrow top edge, full-width bottom edge.
  const inset=params.inset,A=w-1-2*inset,G=-2*inset/(w-1),H=(h-1)*(1+G);
  for(let y=0;y<h;y++){const v=y/(H-G*y),sy=v*(h-1);for(let x=0;x<w;x++){const u=(x*(1+G*v)+inset*v-inset)/A,sx=u*(w-1);if(sx<0||sx>w-1||sy<0||sy>h-1)continue;const ix=Math.round(sx),iy=Math.round(sy);for(let c=0;c<4;c++)out[(y*w+x)*4+c]=data[(iy*w+ix)*4+c];}}
  return new ImageData(out,w,h);
 }
 if(caseName==='blur'){
  const {width:w,height:h,data}=current,r=Math.max(1,Math.ceil(params.radius*2)),weights=[];let total=0;for(let k=-r;k<=r;k++){const t=Math.exp(-k*k/(2*params.radius**2));weights.push(t);total+=t;}
  const tmp=new Float32Array(data.length),out=new Uint8ClampedArray(data.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let sum=0;for(let k=-r;k<=r;k++)sum+=data[(y*w+Math.max(0,Math.min(w-1,x+k)))*4+c]*weights[k+r];tmp[(y*w+x)*4+c]=sum/total;}
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){for(let c=0;c<3;c++){let sum=0;for(let k=-r;k<=r;k++)sum+=tmp[(Math.max(0,Math.min(h-1,y+k))*w+x)*4+c]*weights[k+r];out[(y*w+x)*4+c]=sum/total;}out[(y*w+x)*4+3]=255;}return new ImageData(out,w,h);
 }
 if(caseName==='jpeg'){
  const canvas=document.createElement('canvas');canvas.width=current.width;canvas.height=current.height;canvas.getContext('2d').putImageData(current,0,0);
  const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',params.quality));if(!blob)throw Error('JPEG生成に対応していません。');
  const bitmap=await createImageBitmap(blob);canvas.getContext('2d').drawImage(bitmap,0,0);bitmap.close();return canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
 }
 return current;
}
export async function checkPair(plain,double,publicText,hidden,key,rep){
 const start=performance.now(),a=await decodeBoth(plain),b=await decodeBoth(double);let recovered=false;try{const value=await recover(double,key,rep,b);recovered=value.public===publicText&&value.hidden===hidden;}catch{}
 return {plain_zxing:a.zxing?.public===publicText,plain_jsqr:a.jsqr?.public===publicText,double_zxing:b.zxing?.public===publicText,double_jsqr:b.jsqr?.public===publicText,hidden:recovered,elapsed_ms:performance.now()-start};
}
export async function benchmark(input,progress,signal){
 const {publicText,hidden,key,rep,trials=3,seed=20261010}=input,q=await build(publicText,hidden,key,rep),a=image(pixels(q.plain)),b=image(pixels(q.matrix));const rows=[];
 for(const [ci,caseName]of CASES.entries())for(let t=0;t<trials;t++){if(signal?.aborted)throw Error('測定を中止しました。');const runSeed=seed+ci*10000+t,parameters=paramsFor(caseName,runSeed),result=await checkPair(await transform(a,caseName,parameters,runSeed),await transform(b,caseName,parameters,runSeed),publicText,hidden,key,rep);rows.push({case:caseName,trial:t+1,parameters,seed:runSeed,...result});progress(rows.length,CASES.length*trials);await pause();}
 return {...metadata('benchmark',seed),public:publicText,hidden_bytes:utf8(hidden).length,repetitions:rep,rows,summary:Object.fromEntries(CASES.map(c=>[c,Object.fromEntries(['plain_zxing','plain_jsqr','double_zxing','double_jsqr','hidden'].map(m=>[m,rate(rows.filter(r=>r.case===c).map(r=>r[m]))]))]))};
}
export async function capacity(input,progress,signal){
 const {publicText,key,rep,maxBytes=32,samples=2,seed=20261010}=input,upper=Math.min(255,Math.floor(SLOTS.length/(8*rep))-9),limit=Math.min(upper,maxBytes),rows=[];
 for(let n=1;n<=limit;n++)for(let sample=0;sample<samples;sample++){
  if(signal?.aborted)throw Error('測定を中止しました。');const random=rng(seed+n*100+sample),alphabet='abcdefghijklmnopqrstuvwxyz0123456789',hidden=Array.from({length:n},()=>alphabet[Math.floor(random()*alphabet.length)]).join(''),q=await build(publicText,hidden,key,rep),row={bytes:n,sample:sample+1,budget_ok:q.budget.budget_ok,min_remaining:q.budget.min_remaining,tested:false,tests:[]};
  if(q.budget.budget_ok){const a=image(pixels(q.plain)),b=image(pixels(q.matrix));for(const caseName of ['original','resize','perspective']){const runSeed=seed+n*100+sample+CASES.indexOf(caseName)*10000,parameters=paramsFor(caseName,runSeed);row.tests.push({case:caseName,parameters,seed:runSeed,...await checkPair(await transform(a,caseName,parameters,runSeed),await transform(b,caseName,parameters,runSeed),publicText,hidden,key,rep)});await pause();}row.tested=true;row.clean_pass=row.tests[0].double_zxing&&row.tests[0].double_jsqr&&row.tests[0].hidden;row.hidden_all=row.tests.every(t=>t.hidden);row.zxing_all=row.tests.every(t=>t.double_zxing);row.jsqr_all=row.tests.every(t=>t.double_jsqr);row.strict_all=row.hidden_all&&row.zxing_all&&row.jsqr_all;}
  rows.push(row);progress(rows.length,limit*samples);await pause();
 }
 const maximum=field=>Math.max(0,...Array.from({length:limit},(_,i)=>i+1).filter(n=>rows.filter(r=>r.bytes===n).every(r=>r[field])));
 return{...metadata('capacity',seed),public:publicText,repetitions:rep,rows,scanned_through_bytes:limit,slot_upper_bytes:upper,full_scan:limit===upper,max_clean_bytes:maximum('clean_pass'),max_hidden_bytes:maximum('hidden_all'),max_strict_bytes:maximum('strict_all'),samples_per_length:samples};
}
export async function statistics(input,progress,signal){
 const {hidden,key,rep,count=24,seed=20261010}=input,data=[];
 for(const split of ['train','test'])for(let i=0;i<count;i++){if(signal?.aborted)throw Error('測定を中止しました。');const publicText=`https://example.com/${seed}-${split}-${i}`,q=await build(publicText,hidden,key,rep);data.push({split,plain:features(q.plain),double:features(q.matrix),changed_modules:q.budget.changed_modules,budget_ok:q.budget.budget_ok});progress(data.length,count*2);await pause();}
 const train=data.filter(x=>x.split==='train'),all=train.flatMap(x=>[x.plain,x.double]),mean=Array.from({length:4},(_,i)=>all.reduce((s,x)=>s+x[i],0)/all.length),scale=mean.map((m,i)=>Math.max(1e-6,Math.sqrt(all.reduce((s,x)=>s+(x[i]-m)**2,0)/all.length))),norm=x=>x.map((v,i)=>(v-mean[i])/scale[i]);
 const center=field=>Array.from({length:4},(_,i)=>train.reduce((s,x)=>s+norm(x[field])[i],0)/train.length),c0=center('plain'),c1=center('double'),score=x=>norm(x).reduce((s,v,i)=>s+(v-c0[i])**2-(v-c1[i])**2,0),test=data.filter(x=>x.split==='test'),negative=test.map(x=>score(x.plain)),positive=test.map(x=>score(x.double));let auc=0;for(const p of positive)for(const n of negative)auc+=p>n?1:p===n?.5:0;
 return {...metadata('statistics',seed),rows:data,repetitions:rep,hidden_bytes:utf8(hidden).length,train_pairs:count,test_pairs:count,features:['black_ratio','horizontal_transition','vertical_transition','uniform_2x2'],classifier:'訓練データで標準化した最近傍クラス重心。閾値0を事前固定。',known_encoder_threshold_changed_modules:1,auc:auc/(count*count),true_positive:rate(positive.map(x=>x>0)),false_positive:rate(negative.map(x=>x>0)),known_encoder_true_positive:rate(test.map(x=>x.changed_modules>0)),known_encoder_false_positive:rate(test.map(()=>false)),notes:[`訂正予算外も含む行列の比較です。予算外 ${data.filter(x=>!x.budget_ok).length}/${data.length}ペア。表の読み取り成功を選別条件にはしていません。`,'生成行列の実測。写真ではありません。訓練と評価のURLは分離。','単純な白黒統計の低いAUCは検出耐性の証明ではありません。','既知生成器差分は表から正常QRを再生成できる観察者を想定。鍵は不要です。']};
}

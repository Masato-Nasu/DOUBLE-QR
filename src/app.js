import {build,plainQR,pixels,N,utf8} from './core.js';
import {buildPacked,maxPackedBytes} from './packed.js';
import {prepareHidden} from './compression.js';
import {buildLarge,maxLargeBytes,plainLarge} from './large.js';
import {createPadding} from './pad-channel.js';
import {plainPad,padCapacity} from './pad-matrix.js';
import {configureReader,decodeBoth,recover,verify,createCameraAccumulator} from './reader.js';
import {benchmark,capacity,statistics,LABELS} from './experiments.js';
const $=id=>document.getElementById(id);
configureReader({locateFile:path=>new URL('./vendor/'+path,document.baseURI).href});
let current=null,currentView='double',pngURL=null,pngBlob=null,selectedImage=null,secret='',generation=0,jobController=null,lastReport=null;
const messages={double:'二重QR',plain:'通常QR',diff:'差分：青＝白→黒、橙＝黒→白'};
function status(id,text,error=false){$(id).textContent=text;$(id).classList.toggle('error',error);}
function input(){return{publicText:$('public').value,hidden:$('hidden').value,key:$('key').value,rep:Number($('rep').value)||1,auto:$('rep').value==='auto',compress:$('compression').value==='auto',qrVersion:Number($('qrVersion').value)};}
function toImageData(raw){return new ImageData(raw.data,raw.width,raw.height);}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
function rowTable(head,rows){const wrap=document.createElement('div');wrap.className='scroll';const table=document.createElement('table'),thead=document.createElement('thead'),tr=document.createElement('tr');for(const item of head){const th=document.createElement('th');th.textContent=item;tr.append(th);}thead.append(tr);table.append(thead);const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const item of row){const td=document.createElement('td');td.textContent=item;tr.append(td);}body.append(tr);}table.append(body);wrap.append(table);return wrap;}
function paragraph(parent,text){const p=document.createElement('p');p.className='hint';p.textContent=text;parent.append(p);}
function showTab(which){const reading=which==='read';$('makePanel').hidden=reading;$('readPanel').hidden=!reading;$('makeTab').setAttribute('aria-selected',String(!reading));$('readTab').setAttribute('aria-selected',String(reading));if(reading&&!$('readKey').value)$('readKey').value=$('key').value;if(!reading)stopCamera();}
$('makeTab').onclick=()=>showTab('make');$('readTab').onclick=()=>showTab('read');
document.querySelectorAll('[data-password]').forEach(button=>button.onclick=()=>{const field=$(button.dataset.password);field.type=field.type==='password'?'text':'password';button.textContent=field.type==='password'?'表示':'隠す';button.setAttribute('aria-label',field.type==='password'?'鍵を表示':'鍵を隠す');});
function updateCapacity(){
 const bytes=utf8($('hidden').value).length,mode=$('qrVersion').value,max=mode==='36'?padCapacity($('public').value):mode==='20'?maxLargeBytes(1):maxPackedBytes(1);
 $('byteCount').textContent=`${bytes} / ${max} bytes`;
 const best=mode==='36'?1:[5,3,1].find(rep=>bytes<=(mode==='20'?maxLargeBytes(rep):maxPackedBytes(rep)));
 const experimenting=$('compression').value==='auto';
 $('rep').disabled=mode==='36';
 $('repHint').textContent=mode==='36'?'余白実験の容量上限は、表の長さから計算します。1重固定で、一般QRと裏の復元を自動検査します。':mode==='20'?'Version 20の1重は最大255バイト（圧縮後）。実際の検査は作成時に行います。':'標準版の上限は1重123バイト・3重35バイト・5重17バイトです。表と裏を自動検査します。';
 $('versionHint').textContent=mode==='36'?'Version 36・161×161マスの余白データを使う実験モードです。普通の白黒QRですが、規格指定の余白値とは異なります。生成画像の自動検査とスマートフォン実機の成功は別です。強度は1重固定。':mode==='20'?'Version 20は通常規格の白黒QRです。PC画面からの実機読み取りは未検証です。':'実機で裏の読み取りに成功した標準版です。通常の白黒QRを保ちます。';
 $('capacityHint').textContent=experimenting
  ?`原文${bytes}バイト。圧縮後の容量は「QRを作る」で測定します（圧縮で小さくならない文章もあります）。`
  :bytes>max
  ?`容量を超えています（${bytes} / ${max}バイト）。裏を短くしてください。`
  :`自動設定では最大${best}重で試します。実際の読み取りは生成時に検査します。`;
 $('capacityHint').classList.toggle('error',bytes>max&&!experimenting);
}
$('hidden').oninput=updateCapacity;$('public').oninput=updateCapacity;$('compression').onchange=updateCapacity;$('qrVersion').onchange=updateCapacity;updateCapacity();
$('maker').addEventListener('input',()=>{generation++;setGenerationBusy(false);current=null;$('output').hidden=true;status('makeStatus','');});
function setGenerationBusy(busy){$('generate').disabled=busy;$('plain').disabled=busy;}
function drawDiff(){const n=Math.sqrt(current.matrix.length),canvas=$('qr'),context=canvas.getContext('2d');canvas.width=canvas.height=(n+12)*14;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);for(let r=0;r<n;r++)for(let c=0;c<n;c++){const i=r*n+c,a=current.plain[i],b=current.matrix[i];context.fillStyle=a===b?(a?'#cbd0ca':'#fff'):(b?'#0064d2':'#d74623');context.fillRect((c+6)*14,(r+6)*14,14,14);}}
let viewSequence=0;
async function showView(view){if(!current)return;const seq=++viewSequence,snapshot=current;currentView=view;$('save').hidden=true;$('share').hidden=true;$('viewLabel').textContent=messages[view];const canvas=$('qr');
 if(view==='diff')drawDiff();else{const raw=pixels(view==='plain'?current.plain:current.matrix);canvas.width=raw.width;canvas.height=raw.height;canvas.getContext('2d').putImageData(toImageData(raw),0,0);}
 document.querySelectorAll('[data-view]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.view===view));b.disabled=current.plainOnly&&b.dataset.view!=='plain';});
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(seq!==viewSequence||current!==snapshot||!blob)return;if(pngURL)URL.revokeObjectURL(pngURL);pngBlob=blob;pngURL=URL.createObjectURL(blob);$('save').href=pngURL;$('save').download=view==='double'?'double-qr.png':view==='plain'?'ordinary-qr.png':'double-qr-difference.png';const allowed=view!=='double'||current.accepted;$('save').hidden=!allowed;$('share').hidden=!allowed;$('enlarge').hidden=!allowed||view==='diff';$('output').hidden=false;$('outputHint').textContent=view==='diff'?messages.diff:view==='plain'?'裏メッセージを含まない通常QRです。':current.accepted?'標準カメラでは表、DOUBLE QRでは裏を読めます。':'診断表示です。検査を通過していないため保存できません。';
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view).catch(e=>status('makeStatus',e.message,true)));
function renderChecks(){const out=$('checks');out.replaceChildren();if(!current.checks)return;for(const [name,ok]of [['表 · ZXing',current.checks.zxing],['表 · jsQR',current.checks.jsqr],['裏 · 本文一致',current.checks.hidden]]){const row=document.createElement('div');row.className='check-row';const label=document.createElement('span');label.textContent=name;const state=document.createElement('strong');state.className=ok?'success':'failure';state.textContent=ok?'成功':'失敗';row.append(label,state);out.append(row);}$('budgetInfo').textContent=`変更 ${current.budget.changed_modules}マス（${current.budget.changed_percent.toFixed(2)}%）。訂正残量の最小値 ${current.budget.min_remaining}語。各ブロック2語以上を保存条件にしています。`;$('blockTable').replaceChildren(rowTable(['ブロック','変更語数','訂正限界','残り'],current.budget.blocks.map(b=>[b.block,b.changed_codewords,b.correction_limit,b.remaining])));}
$('maker').onsubmit=async event=>{event.preventDefault();if(!globalThis.crypto?.subtle){status('makeStatus','HTTPSまたはlocalhostで開いてください。',true);return;}const id=++generation;setGenerationBusy(true);$('output').hidden=true;status('makeStatus','QRを作成・検査しています…');try{const data=input(),bytes=utf8(data.hidden).length,max=data.qrVersion===36?padCapacity(data.publicText):data.qrVersion===20?maxLargeBytes(1):maxPackedBytes(1);
 if(!data.compress&&bytes>max)throw Error(`裏は最大${max}バイトです（現在${bytes}バイト）。入力を短くしてください。`);
 const prepared=data.compress?await prepareHidden(data.hidden,true):null;
 if(id!==generation)return;
 const stored=prepared?.storedBytes??bytes;
 if(stored>max)throw Error(`保存容量を超えています。原文${bytes}バイト、${data.compress?'圧縮後':'保存'}${stored}バイト。上限${max}バイトです。`);
 let result=null;
 if(data.qrVersion===36){
  for(const mask of [0,1,2,3,4,5,6,7]){
   const q=await createPadding(data.publicText,data.hidden,data.key,prepared,mask);
   if(id!==generation)return;
   const checks=await verify(toImageData(pixels(q.matrix,8,4)),data.publicText,data.hidden,data.key,1);
   if(id!==generation)return;
   result={...q,checks,accepted:checks.zxing&&checks.jsqr&&checks.hidden};
   if(result.accepted)break;
  }
 }else{
  for(const rep of data.auto?[5,3,1]:[data.rep]){
   if(stored>(data.qrVersion===20?maxLargeBytes(rep):maxPackedBytes(rep)))continue;
   const q=data.qrVersion===20?await buildLarge(data.publicText,data.hidden,data.key,rep,prepared):await buildPacked(data.publicText,data.hidden,data.key,rep,prepared);
   if(id!==generation)return;
   if(!q.budget.budget_ok)continue;
   const checks=await verify(toImageData(pixels(q.matrix)),data.publicText,data.hidden,data.key,rep);
   if(id!==generation)return;
   result={...q,checks,accepted:checks.zxing&&checks.jsqr&&checks.hidden};
   if(result.accepted)break;
  }
 }
 if(!result)throw Error('この文章は指定した強度の容量を超えています。「自動」を選ぶか裏を短くしてください。');
 if(!result.accepted)throw Error('読み取り検査に合格するQRを作成できませんでした。読めないQRは表示しません。文章を短くして再試行してください。');
 current=result;renderChecks();await showView('double');
 status('makeStatus',`作成しました。表・裏の自動検査を通過しました（${data.qrVersion===36?'余白実験・Version 36':`${current.repetitions}重${data.auto?'・自動選択':''}`}）${current.compressed?`。圧縮: ${bytes} → ${stored}バイト`:''}。${data.qrVersion===36?'余白方式は実機での裏読み取りが未確認です。':data.qrVersion===20?'大きいQRは実験機能であり、実機読み取りはまだ未確認です。':''}画面を読み取る場合は「全画面でQRを表示」を押してください。`);}catch(e){if(id===generation){current=null;status('makeStatus',e.message,true);}}finally{if(id===generation)setGenerationBusy(false);}};
$('plain').onclick=async()=>{++generation;setGenerationBusy(true);$('output').hidden=true;status('makeStatus','通常QRを作成しています…');try{const q=$('qrVersion').value==='36'?plainPad($('public').value):$('qrVersion').value==='20'?plainLarge($('public').value):plainQR($('public').value);current={plain:q.matrix,matrix:q.matrix,plainOnly:true,accepted:true};$('checks').replaceChildren();$('blockTable').replaceChildren();$('budgetInfo').textContent='裏メッセージは含まれていません。';await showView('plain');status('makeStatus','通常QRを作成しました。');}catch(e){status('makeStatus',e.message,true);}finally{setGenerationBusy(false);}};
$('share').onclick=async()=>{if(!pngBlob)return;const file=new File([pngBlob],$('save').download,{type:'image/png'});try{if(navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'DOUBLE QR'});else{download(pngBlob,$('save').download);status('makeStatus','画像を保存しました。画像ファイルを共有してください。');}}catch(e){if(e.name!=='AbortError')status('makeStatus','共有できませんでした。「保存」をお使いください。',true);}};
$('enlarge').onclick=()=>{if(!current?.accepted||!pngURL||currentView==='diff')return;$('zoom').classList.toggle('large-qr',current.qrVersion===36);$('zoomImage').src=pngURL;$('zoom').showModal();};$('closeZoom').onclick=()=>$('zoom').close();
async function loadFile(file){if(file.size>24*1024*1024)throw Error('画像は24MB以下にしてください。');let bitmap;try{bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});}catch{const url=URL.createObjectURL(file);try{bitmap=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=url;});}catch{throw Error('この画像を開けません。JPEGまたはPNGを選んでください。');}finally{URL.revokeObjectURL(url);}}const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();return ctx.getImageData(0,0,canvas.width,canvas.height);}
function showDecoded(value){$('decoded').hidden=false;$('publicResult').textContent=value.public;$('openPublic').hidden=true;try{const u=new URL(value.public);if(['http:','https:'].includes(u.protocol)){$('openPublic').href=u.href;$('openPublic').hidden=false;}}catch{}$('secretMessage').hidden=value.hidden===undefined;secret=value.hidden??'';$('secretResult').textContent=secret;}
let readSequence=0;
async function readSelected(frontOnly=false){if(!selectedImage){status('readStatus','画像を選択してください。',true);return;}const seq=++readSequence;$('decoded').hidden=true;status('readStatus','読み取り中…');try{const codes=await decodeBoth(selectedImage),front=codes.zxing||codes.jsqr;if(!front)throw Error('QRが見つかりません。QR全体が鮮明に写った画像を選んでください。');if(seq!==readSequence)return;showDecoded({public:front.public});if(frontOnly||!$('readKey').value){status('readStatus',frontOnly?'表を読み取りました。':'表を読み取りました。裏を読むには鍵を入力して「読み取る」を押してください。');return;}const value=await recover(selectedImage,$('readKey').value,$('readRep').value,codes);if(seq!==readSequence)return;showDecoded(value);status('readStatus','表と裏を読み取りました。');}catch(e){if(seq===readSequence)status('readStatus',e.message,true);}}
let fileSequence=0;
$('file').onchange=async()=>{stopCamera();const seq=++fileSequence;readSequence++;const file=$('file').files[0];if(!file)return;selectedImage=null;$('decoded').hidden=true;status('readStatus','画像を開いています…');try{const image=await loadFile(file);if(seq!==fileSequence)return;selectedImage=image;await readSelected();}catch(e){if(seq===fileSequence)status('readStatus',e.message,true);}};
$('readAgain').onclick=()=>readSelected();$('frontOnly').onclick=()=>readSelected(true);$('reader').onsubmit=e=>{e.preventDefault();readSelected();};$('readKey').onchange=()=>{if(selectedImage)readSelected();};$('readRep').onchange=()=>{if(selectedImage)readSelected();};
$('copySecret').onclick=async()=>{try{await navigator.clipboard.writeText(secret);status('readStatus','裏メッセージをコピーしました。');}catch{status('readStatus','コピーできません。表示された文章を長押しして選択してください。',true);}};
let cameraStream=null,cameraToken=0,cameraTimer=null;
function stopCamera(){cameraToken++;clearTimeout(cameraTimer);if(cameraStream)cameraStream.getTracks().forEach(track=>track.stop());cameraStream=null;$('camera').srcObject=null;$('cameraPanel').hidden=true;$('cameraStart').disabled=false;}
$('cameraStop').onclick=()=>{stopCamera();status('readStatus','カメラを停止しました。');};
$('cameraStart').onclick=async()=>{stopCamera();if(!navigator.mediaDevices?.getUserMedia){status('readStatus','この環境ではカメラを使えません。HTTPSで開くか、画像を選んでください。',true);return;}const token=cameraToken;$('cameraStart').disabled=true;status('readStatus','カメラの使用を許可してください。');try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});if(token!==cameraToken){stream.getTracks().forEach(t=>t.stop());return;}cameraStream=stream;$('cameraPanel').hidden=false;$('camera').srcObject=stream;await $('camera').play();status('readStatus','QR全体を枠内に入れて、正面から向けてください。');const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),history=createCameraAccumulator();
 const scan=async()=>{if(token!==cameraToken)return;const video=$('camera');if(video.readyState>=2&&video.videoWidth){const scale=Math.min(1,1600/video.videoWidth);canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);ctx.drawImage(video,0,0,canvas.width,canvas.height);const img=ctx.getImageData(0,0,canvas.width,canvas.height);
 try{
  const codes=await decodeBoth(img),front=codes.zxing||codes.jsqr;
  if(token!==cameraToken)return;
  if(front){
   selectedImage=img;
   if(!$('readKey').value){
    stopCamera();showDecoded({public:front.public});
    status('readStatus','表を読み取りました。裏はDOUBLE QR専用の「読む」と作成時の鍵が必要です。');
    return;
   }
   const frames=history.add(img,front),key=$('readKey').value,reps=$('readRep').value;
   let value=null;
   if(frames===1){try{value=await recover(img,key,reps,codes);}catch{}}
   if(!value&&frames>=3&&frames%2===1){try{value=await history.recover(key,reps);}catch{}}
   if(token!==cameraToken)return;
   if(value){
    stopCamera();showDecoded(value);status('readStatus','表と裏を読み取りました。');return;
   }
   status('readStatus',`表は検出しています。裏を復元中（${frames}フレーム）。画面のQRを大きく表示し、正面からしっかり写してください。鍵が合っているかも確認してください。`);
  }else{
   status('readStatus',history.count?'表のQRが画面から外れました。QR全体を正面に戻してください。':'QRが見つかりません。QR全体を大きく、正面から写してください。');
  }
 }catch(e){
  if(token===cameraToken)status('readStatus','画面を解析できませんでした。カメラを安定させてQRを正面から写してください。');
 }}
 if(token===cameraToken)cameraTimer=setTimeout(scan,250);};scan();
 }catch(e){if(token===cameraToken){stopCamera();status('readStatus',e.name==='NotAllowedError'?'カメラが許可されていません。ブラウザの設定で許可するか、画像を選んでください。':'カメラを起動できませんでした。画像を選んでください。',true);}}};
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopCamera();});window.addEventListener('pagehide',()=>{stopCamera();jobController?.abort();});
$('jobType').onchange=()=>{for(const type of ['benchmark','capacity','statistics'])$(type+'Options').hidden=$('jobType').value!==type;};
function number(id,min,max){const value=Number($(id).value);if(!Number.isInteger(value)||value<min||value>max)throw Error(`${$(id).previousElementSibling.textContent}は${min}〜${max}で指定してください。`);return value;}
const rtext=r=>`${r.success}/${r.trials} (${r.percent?.toFixed(1)??'—'}%)`;
function renderReport(r){const out=$('report');out.replaceChildren();paragraph(out,r.evidence);if(r.kind==='benchmark'){out.append(rowTable(['条件','通常 ZX','二重 ZX','通常 jsQR','二重 jsQR','裏'],Object.entries(r.summary).map(([c,v])=>[LABELS[c],...['plain_zxing','double_zxing','plain_jsqr','double_jsqr','hidden'].map(k=>rtext(v[k]))])));}else if(r.kind==='capacity'){paragraph(out,`今回の最大成功長：元PNG ${r.max_clean_bytes}B ／ 裏が全条件成功 ${r.max_hidden_bytes}B ／ 厳格合格 ${r.max_strict_bytes}B。どれも保証容量ではありません。`);paragraph(out,`走査1〜${r.scanned_through_bytes}B、形式・マス数による上限${r.slot_upper_bytes}B。各長さ${r.samples_per_length}本文。${r.full_scan?'形式範囲を全走査しました。':'上限までの全走査ではありません。'}`);const lengths=[...new Set(r.rows.map(x=>x.bytes))];out.append(rowTable(['長さ','予算内','元PNG','表 ZX 全条件','表 jsQR 全条件','裏 全条件','厳格合格'],lengths.map(n=>{const rows=r.rows.filter(x=>x.bytes===n),count=field=>`${rows.filter(x=>x[field]).length}/${rows.length}`;return[n+'B',...['budget_ok','clean_pass','zxing_all','jsqr_all','hidden_all','strict_all'].map(count)];})));paragraph(out,'予算外は読み取り未測定です。0件の合格が「裏の復元に失敗」とは限りません。本文や変形条件が異なるため、最大値以下の全長の成功を保証しません。');}else{paragraph(out,`白黒統計のAUC ${r.auc.toFixed(4)}。訓練${r.train_pairs}ペア、別URLの評価${r.test_pairs}ペア。`);out.append(rowTable(['検出手法','二重QRを検出','通常QRを誤検出'],[['白黒統計',rtext(r.true_positive),rtext(r.false_positive)],['既知生成器差分',rtext(r.known_encoder_true_positive),rtext(r.known_encoder_false_positive)]]));}for(const note of r.notes)paragraph(out,note);}
$('runJob').onclick=async()=>{if(jobController)return;try{const data=input();if(!data.publicText.trim()||!data.key)throw Error('「作る」で表の内容と鍵を入力してください。');data.seed=number('seed',0,4000000000);const kind=$('jobType').value;if(kind==='benchmark')data.trials=number('trials',1,10);if(kind==='capacity'){data.maxBytes=number('maxBytes',1,255);data.samples=number('samples',1,3);}if(kind==='statistics')data.count=number('count',8,64);jobController=new AbortController();$('runJob').disabled=true;$('cancelJob').hidden=false;$('progress').hidden=false;$('progress').removeAttribute('value');$('reportDownloads').hidden=true;status('jobStatus','自動測定を始めています…');const progress=(done,total)=>{$('progress').max=total;$('progress').value=done;status('jobStatus',`自動測定 ${done} / ${total}`);};const r=await {benchmark,capacity,statistics}[kind](data,progress,jobController.signal);lastReport=r;renderReport(r);$('reportDownloads').hidden=false;status('jobStatus','自動測定が完了しました。実機測定ではありません。');}catch(e){status('jobStatus',e.message,true);}finally{jobController=null;$('runJob').disabled=false;$('cancelJob').hidden=true;$('progress').hidden=true;}};
$('cancelJob').onclick=()=>jobController?.abort();$('json').onclick=()=>{if(lastReport)download(new Blob([JSON.stringify(lastReport,null,2)],{type:'application/json'}),'double-qr-'+lastReport.kind+'.json');};$('csv').onclick=()=>{if(!lastReport)return;const rows=lastReport.rows,keys=[...new Set(rows.flatMap(x=>Object.keys(x)))],escape=v=>{const s=typeof v==='object'?JSON.stringify(v):String(v??'');return '"'+s.replaceAll('"','""')+'"';};const csv='\ufeff'+[keys.map(escape).join(','),...rows.map(r=>keys.map(k=>escape(r[k])).join(','))].join('\r\n');download(new Blob([csv],{type:'text/csv'}),'double-qr-'+lastReport.kind+'.csv');};
const phoneStorage='double-qr-pwa-device-trials';let phoneRows=[];try{const v=JSON.parse(localStorage.getItem(phoneStorage)||'[]');if(Array.isArray(v))phoneRows=v;}catch{}
function renderPhone(){const out=$('phoneSummary');out.replaceChildren();if(!phoneRows.length){paragraph(out,'PWA版の実機記録：0件（未測定）');return;}const groups=new Map();for(const r of phoneRows){const key=JSON.stringify([r.set,r.device,r.conditions,r.target,r.rep,r.bytes]);if(!groups.has(key))groups.set(key,{r,values:[]});groups.get(key).values.push(r.success);}out.append(rowTable(['試験セット・端末・条件','対象 / 強度 / 容量','成功'],[...groups.values()].map(({r,values})=>[`${r.set} / ${r.device} / ${r.conditions}`,`${r.target} / ${r.rep}重 / ${r.bytes}B`,rtext({success:values.filter(Boolean).length,trials:values.length,percent:100*values.filter(Boolean).length/values.length})])));}
function savePhone(){try{localStorage.setItem(phoneStorage,JSON.stringify(phoneRows));status('phoneStatus','このブラウザに保存しました。');}catch{status('phoneStatus','保存できませんでした。JSONを書き出してください。',true);}renderPhone();}
$('phoneForm').onsubmit=e=>{e.preventDefault();const target=$('phoneTarget').value;phoneRows.push({version:'0.4-pwa',evidence:'user_reported_device_test',timestamp:new Date().toISOString(),set:$('phoneSet').value,device:$('phoneDevice').value,conditions:$('phoneConditions').value,target,rep:target==='plain'?0:Number($('phoneRep').value),bytes:target==='plain'?0:Number($('phoneBytes').value),success:$('phoneOutcome').value==='success'});savePhone();};$('phoneUndo').onclick=()=>{phoneRows.pop();savePhone();};$('phoneExport').onclick=()=>download(new Blob([JSON.stringify({evidence:'スマートフォン実機・手動記録',rows:phoneRows},null,2)],{type:'application/json'}),'double-qr-pwa-device-tests.json');renderPhone();
let installPrompt=null,registration=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});window.addEventListener('appinstalled',()=>{$('install').hidden=true;installPrompt=null;});if(matchMedia('(display-mode: standalone)').matches||navigator.standalone)$('install').hidden=true;
$('install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else $('installHelp').showModal();};$('closeInstall').onclick=()=>$('installHelp').close();
function watchWaiting(reg){const worker=reg.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){$('updateApp').textContent='新しい版を適用';status('offlineState','更新があります。「詳細」から適用できます。');}});}
if('serviceWorker'in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
 navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(reg=>{registration=reg;watchWaiting(reg);reg.addEventListener('updatefound',()=>watchWaiting(reg));return navigator.serviceWorker.ready;}).then(()=>{status('offlineState',navigator.onLine?'オフラインで使えます。処理は端末内のみ。':'オフライン · 端末内で使えます。');}).catch(()=>status('offlineState','オフライン準備ができませんでした。接続中は利用できます。',true));
 let refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!refreshing&&sessionStorage.getItem('dqr-apply-update')){refreshing=true;sessionStorage.removeItem('dqr-apply-update');location.reload();}});
}else status('offlineState','端末内で処理します。PWAの追加にはHTTPSが必要です。');
$('updateApp').onclick=async()=>{if(!registration){status('offlineState','HTTPSで開いてからお試しください。',true);return;}try{if(registration.waiting){sessionStorage.setItem('dqr-apply-update','1');registration.waiting.postMessage({type:'SKIP_WAITING'});}else{await registration.update();if(registration.waiting){$('updateApp').textContent='新しい版を適用';status('offlineState','更新があります。入力内容は更新すると消えます。');}else status('offlineState','更新を確認しました。');}}catch{status('offlineState','更新の確認には通信が必要です。',true);}};

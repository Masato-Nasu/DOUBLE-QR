// Experimental static Version 20/H DOUBLE QR. Not enabled by default.
// Uses the same normal black/white QR grid and standard Reed-Solomon budget;
// never add colors, borders, markers or animation to the code.
import QRCode from 'qrcode/lib/core/qrcode.js';
import ECCode from 'qrcode/lib/core/error-correction-code.js';
import ECLevel from 'qrcode/lib/core/error-correction-level.js';
import Utils from 'qrcode/lib/core/utils.js';
import {utf8,concat,sha256,packetBytes} from './core.js';
import {decodePacket} from './packed.js';

export const LARGE_VERSION=20,LARGE_N=4*LARGE_VERSION+17;
export function plainLarge(publicText){
 if(!publicText.trim())throw Error('表の内容を入力してください。');
 if(utf8(publicText).length>150)throw Error('表はUTF-8で150バイト以内にしてください。');
 const mode=/^[0-9]+$/.test(publicText)?'numeric':/^[0-9A-Z $%*+./:\-]+$/.test(publicText)?'alphanumeric':'byte';
 const q=QRCode.create([{data:publicText,mode}],{version:LARGE_VERSION,errorCorrectionLevel:'H',maskPattern:0});
 return{matrix:Uint8Array.from(q.modules.data),reserved:Uint8Array.from(q.modules.reservedBit)};
}
const template=plainLarge('HELLO');
const slots=Array.from({length:LARGE_N*LARGE_N},(_,i)=>i).filter(i=>!template.reserved[i]);
const total=Utils.getSymbolTotalCodewords(LARGE_VERSION),
 blocksCount=ECCode.getBlocksCount(LARGE_VERSION,ECLevel.H),
 parityTotal=ECCode.getTotalCodewordsCount(LARGE_VERSION,ECLevel.H),
 dataTotal=total-parityTotal;
if(parityTotal%blocksCount)throw Error('Unsupported QR error correction partition');
const ecPerBlock=parityTotal/blocksCount,largeCount=dataTotal%blocksCount,smallData=Math.floor(dataTotal/blocksCount);
export const LARGE_BLOCKS=Array.from({length:blocksCount},(_,i)=>{
 const data=smallData+(i>=blocksCount-largeCount?1:0);
 return{data,total:data+ecPerBlock,limit:Math.floor(ecPerBlock/2)};
});
const blockOfWord=[];
for(let i=0;i<Math.max(...LARGE_BLOCKS.map(b=>b.data));i++)
 LARGE_BLOCKS.forEach((b,j)=>{if(i<b.data)blockOfWord.push(j);});
for(let i=0;i<ecPerBlock;i++)
 LARGE_BLOCKS.forEach((_,j)=>blockOfWord.push(j));
if(blockOfWord.length!==total)throw Error('QR symbol codeword count mismatch');
function codewordMap(){
 const allowed=new Set(slots),order=[];
 let row=LARGE_N-1,direction=-1;
 for(let right=LARGE_N-1;right>0;right-=2){
  const col=right<=6?right-1:right;
  while(true){
   for(const c of [col,col-1])if(allowed.has(row*LARGE_N+c))order.push(row*LARGE_N+c);
   row+=direction;
   if(row<0||row>=LARGE_N){row-=direction;direction=-direction;break;}
  }
 }
 const map=new Map();
 order.forEach((p,i)=>{if((i>>3)<total)map.set(p,[i>>3,blockOfWord[i>>3]]);});
 if(map.size!==total*8)throw Error('QR codeword map length is invalid');
 return map;
}
const wordMap=codewordMap();
export function maxLargeBytes(rep=1){
 if(![1,3,5].includes(rep))throw Error('強度の値が不正です。');
 const safeWords=LARGE_BLOCKS.reduce((s,b)=>s+Math.max(0,b.limit-2),0);
 return Math.max(0,Math.min(255,Math.floor(safeWords/rep)-9));
}
export async function largePositions(publicText,key){
 const randomSeed=await sha256(concat(utf8('DQR-v20-positions-1'),utf8(publicText),utf8(key)));
 let state=new DataView(randomSeed.buffer,randomSeed.byteOffset,randomSeed.byteLength).getUint32(0);
 const rand=()=>{state=(state+0x6d2b79f5)>>>0;let x=state;x=Math.imul(x^(x>>>15),x|1);x^=x+Math.imul(x^(x>>>7),x|61);return((x^(x>>>14))>>>0)/4294967296;};
 const order=slots.slice();
 for(let i=order.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 const groups=new Map(),perBlock=LARGE_BLOCKS.map(()=>[]);
 for(const index of order){
  const word=wordMap.get(index);if(!word)continue;
  const [id,block]=word;
  if(!groups.has(id)){groups.set(id,[]);perBlock[block].push(id);}
  groups.get(id).push(index);
 }
 const result=[];
 for(let i=0;i<Math.max(...perBlock.map(b=>b.length));i++)
  for(const row of perBlock)if(i<row.length){
   const cells=groups.get(row[i]);
   if(cells.length!==8)throw Error('QR word has incomplete bits');
   result.push(...cells);
  }
 return result;
}
function correctionBudget(plain,modified){
 const changed=LARGE_BLOCKS.map(()=>new Set());let modules=0;
 for(let i=0;i<plain.length;i++)if(plain[i]!==modified[i]){
  modules++;const w=wordMap.get(i);if(w)changed[w[1]].add(w[0]);
 }
 const blocks=LARGE_BLOCKS.map((b,i)=>({block:i+1,changed_codewords:changed[i].size,correction_limit:b.limit,remaining:b.limit-changed[i].size}));
 return{changed_modules:modules,changed_percent:modules/(LARGE_N*LARGE_N)*100,min_remaining:Math.min(...blocks.map(x=>x.remaining)),budget_ok:blocks.every(b=>b.remaining>=2),blocks};
}
export async function buildLarge(publicText,hidden,key,rep=1,prepared=null){
 if(!key)throw Error('鍵を入力してください。');
 if(key.length>1024)throw Error('鍵が長すぎます。');
 const body=prepared?.body??utf8(hidden),limit=maxLargeBytes(rep);
 if(!body.length||body.length>limit)throw Error(`実験用QR（Version ${LARGE_VERSION}）の裏は最大${limit}バイト（保存するデータ${body.length}バイト）。`);
 const plain=plainLarge(publicText).matrix,matrix=plain.slice();
 const packet=await packetBytes(publicText,body,key),positions=await largePositions(publicText,key),bits=packet.length*8;
 if(bits*rep>positions.length)throw Error('QRの空き容量を超えています。');
 for(let k=0;k<rep;k++)for(let i=0;i<bits;i++)matrix[positions[k*bits+i]]=(packet[i>>3]>>(7-i%8))&1;
 const budget=correctionBudget(plain,matrix);
 if(!budget.budget_ok)throw Error('QRの誤り訂正予算を超えました。文章を短くしてください。');
 return{plain,matrix,budget,publicText,hiddenBytes:utf8(hidden).length,storedBytes:body.length,compressed:!!prepared?.compressed,repetitions:rep,layout:'packed-v20',qrVersion:LARGE_VERSION};
}
export async function readGridLarge(publicText,grid,key,rep=1){
 if(!key)throw Error('鍵を入力してください。');
 if(grid.length!==LARGE_N*LARGE_N)throw Error('QRサイズが異なります。');
 const positions=await largePositions(publicText,key),max=maxLargeBytes(rep);
 const first=positions.slice(0,8).reduce((n,p)=>(n<<1)|grid[p],0);
 const candidates=rep===1?[first]:Array.from({length:max},(_,i)=>i+1);
 for(const len of candidates){
  if(len<1||len>max)continue;
  const count=len+9,bits=count*8,body=new Uint8Array(count);
  for(let i=0;i<bits;i++){
   let votes=0;
   for(let k=0;k<rep;k++)votes+=grid[positions[k*bits+i]];
   if(votes>rep/2)body[i>>3]|=1<<(7-i%8);
  }
  if(body[0]!==len)continue;
  try{return{...await decodePacket(publicText,body,key),repetitions:rep,qrVersion:LARGE_VERSION};}catch{}
 }
 throw Error('実験用QRの裏を復元できませんでした。');
}

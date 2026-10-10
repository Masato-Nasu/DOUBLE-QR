// v0.5: 1 byte of payload per Reed-Solomon codeword.
// Changes are spread across RS blocks. The legacy bit-scattered codec remains
// available through core.readGrid so existing DOUBLE QR images still open.
import {plainQR,positions,WORD_MAP,BLOCKS,packet,budget,utf8,concat,keys} from './core.js';
const decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_CHANGED_PER_BLOCK=BLOCKS.map(b=>Math.max(0,b.limit-2));
const SAFE_WORDS=MAX_CHANGED_PER_BLOCK.reduce((a,b)=>a+b,0);
export function maxPackedBytes(rep=1){
 if(![1,3,5].includes(rep))throw Error('強度の値が不正です。');
 return Math.max(0,Math.min(255,Math.floor(SAFE_WORDS/rep)-9));
}
export async function packedPositions(publicText,key){
 const order=await positions(publicText,key,1),groups=new Map();
 const byBlock=BLOCKS.map(()=>[]);
 for(const cell of order){
  const item=WORD_MAP.get(cell);
  if(!item)continue;
  const [word,block]=item;
  if(!groups.has(word)){groups.set(word,[]);byBlock[block].push(word);}
  groups.get(word).push(cell);
 }
 const result=[];
 const longest=Math.max(...byBlock.map(b=>b.length));
 for(let i=0;i<longest;i++)for(const block of byBlock){
  if(i<block.length){const bits=groups.get(block[i]);if(bits.length!==8)throw Error('QRコード語の配置が不完全です。');result.push(...bits);}
 }
 return result;
}
export async function buildPacked(publicText,hidden,key,rep=1){
 if(!key)throw Error('鍵を入力してください。');
 if(key.length>1024)throw Error('鍵が長すぎます。');
 const count=utf8(hidden).length,maximum=maxPackedBytes(rep);
 if(count>maximum)throw Error(`この強度の裏は最大${maximum}バイトです（現在${count}バイト）。短くするか自動を選択してください。`);
 const plain=plainQR(publicText).matrix;
 const raw=await packet(publicText,hidden,key),loc=await packedPositions(publicText,key),width=raw.length*8;
 if(width*rep>loc.length)throw Error('QRの空き容量を超えています。');
 const matrix=plain.slice();
 for(let k=0;k<rep;k++)for(let i=0;i<width;i++)matrix[loc[k*width+i]]=(raw[i>>3]>>(7-i%8))&1;
 const usage=budget(plain,matrix);
 if(!usage.budget_ok)throw Error('誤り訂正の余裕が不足しました。裏を短くしてください。');
 return {plain,matrix,budget:usage,publicText,hiddenBytes:count,repetitions:rep,layout:'packed'};
}
async function decodePacket(publicText,raw,key){
 const len=raw[0];
 if(len<1||len>255||raw.length!==len+9)throw Error('長さが不正です。');
 const encrypted=raw.slice(1,len+1),tag=raw.slice(len+1);
 const {stream,mac}=await keys(publicText,key,len);
 const expected=new Uint8Array(await crypto.subtle.sign('HMAC',mac,concat(utf8('tag'),utf8(publicText),Uint8Array.of(len),encrypted)));
 let different=0;for(let i=0;i<8;i++)different|=tag[i]^expected[i];
 if(different)throw Error('鍵またはデータが一致しません。');
 return {public:publicText,hidden:decoder.decode(encrypted.map((x,i)=>x^stream[i]))};
}
export async function readGridPacked(publicText,grid,key,rep=1){
 if(!key)throw Error('生成時の鍵を入力してください。');
 const loc=await packedPositions(publicText,key);
 const max=maxPackedBytes(rep);
 const first=loc.slice(0,8).reduce((n,p)=>(n<<1)|grid[p],0);
 const candidates=rep===1?[first]:Array.from({length:max},(_,i)=>i+1);
 for(const len of candidates){
  if(len<1||len>max)continue;
  const bytes=len+9,width=bytes*8,raw=new Uint8Array(bytes);
  for(let i=0;i<width;i++){
   let ones=0;
   for(let k=0;k<rep;k++)ones+=grid[loc[k*width+i]];
   if(ones>rep/2)raw[i>>3]|=1<<(7-i%8);
  }
  if(raw[0]!==len)continue;
  try{return {...await decodePacket(publicText,raw,key),repetitions:rep};}catch{}
 }
 throw Error('裏の復元に失敗しました。');
}

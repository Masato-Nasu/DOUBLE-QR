import QRCode from 'qrcode/lib/core/qrcode.js';
import Utils from 'qrcode/lib/core/utils.js';
import ECCode from 'qrcode/lib/core/error-correction-code.js';
import ECLevel from 'qrcode/lib/core/error-correction-level.js';
import ReedSolomonEncoder from 'qrcode/lib/core/reed-solomon-encoder.js';
import {utf8} from './core.js';

// Version 36 remains the legacy default for previously issued padding QRs.
// New sizes use the same wire packet, QR mask rules and interleaving algorithm.
export const PAD_VERSION=36,PAD_N=161;
export const PAD_VERSIONS=Object.freeze(Array.from({length:25},(_,i)=>i+12));
const layouts=new Map();
function layout(version=PAD_VERSION){
 if(!Number.isInteger(version)||version<12||version>36)throw Error('余白QRのサイズが不正です。');
 if(layouts.has(version))return layouts.get(version);
 const n=version*4+17,total=Utils.getSymbolTotalCodewords(version);
 const count=ECCode.getBlocksCount(version,ECLevel.M);
 const parity=ECCode.getTotalCodewordsCount(version,ECLevel.M);
 const each=parity/count,dataWords=total-parity;
 if(!Number.isInteger(each))throw Error('QR誤り訂正ブロックが不正です。');
 const short=Math.floor(dataWords/count),long=total%count;
 const lens=Array.from({length:count},(_,i)=>short+(i>=count-long?1:0));
 const q=QRCode.create([{data:'HELLO',mode:'byte'}],{version,errorCorrectionLevel:'M',maskPattern:0});
 const reserved=Uint8Array.from(q.modules.reservedBit);
 const indexes=[];let row=n-1,direction=-1;
 for(let right=n-1;right>0;right-=2){
  const col=right<=6?right-1:right;
  for(;;){
   for(const c of [col,col-1])if(!reserved[row*n+c])indexes.push(row*n+c);
   row+=direction;
   if(row<0||row>=n){row-=direction;direction=-direction;break;}
  }
 }
 if(indexes.length<total*8||lens.reduce((a,b)=>a+b,0)!==dataWords)throw Error('QRコード語配置が不正です。');
 const result={version,n,total,count,each,dataWords,lens,indexes:indexes.slice(0,total*8)};
 layouts.set(version,result);
 return result;
}
export function plainPad(publicText,mask=0,version=PAD_VERSION){
 if(!publicText.trim()||utf8(publicText).length>150)throw Error('表は150バイト以内にしてください。');
 layout(version);
 const q=QRCode.create([{data:publicText,mode:'byte'}],{version,errorCorrectionLevel:'M',maskPattern:mask});
 return{matrix:Uint8Array.from(q.modules.data),reserved:Uint8Array.from(q.modules.reservedBit)};
}
const masked=(mask,r,c)=>{switch(mask){
 case 0:return (r+c)%2===0;case 1:return r%2===0;
 case 2:return c%3===0;case 3:return (r+c)%3===0;
 case 4:return (Math.floor(r/2)+Math.floor(c/3))%2===0;
 case 5:return (r*c)%2+(r*c)%3===0;
 case 6:return ((r*c)%2+(r*c)%3)%2===0;
 case 7:return ((r*c)%3+(r+c)%2)%2===0;
 default:throw Error('QRのマスクが不正です。');
}};
function interleaved(matrix,mask,info){
 const {total,indexes,n}=info;
 if(matrix.length!==n*n)throw Error('QRのサイズが一致しません。');
 const words=new Uint8Array(total);
 indexes.forEach((p,i)=>{const r=Math.floor(p/n),c=p%n;words[i>>3]|=(matrix[p]^Number(masked(mask,r,c)))<<(7-i%8);});
 return words;
}
export function dataBytes(matrix,mask,version=PAD_VERSION){
 const info=layout(version),words=interleaved(matrix,mask,info),chunks=info.lens.map(n=>new Uint8Array(n));
 let at=0;
 for(let i=0;i<Math.max(...info.lens);i++)for(const chunk of chunks)if(i<chunk.length)chunk[i]=words[at++];
 const result=new Uint8Array(info.dataWords);at=0;
 for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}
 return result;
}
function encoded(body,info){
 const {each,lens,total,dataWords}=info;
 if(body.length!==dataWords)throw Error('QRデータ量が一致しません。');
 const coder=new ReedSolomonEncoder(each),chunks=[],ecc=[];let offset=0;
 for(const n of lens){const chunk=body.slice(offset,offset+n);chunks.push(chunk);ecc.push(coder.encode(chunk));offset+=n;}
 const result=new Uint8Array(total);let at=0;
 for(let i=0;i<Math.max(...lens);i++)for(const chunk of chunks)if(i<chunk.length)result[at++]=chunk[i];
 for(let i=0;i<each;i++)for(const block of ecc)result[at++]=block[i];
 if(at!==total)throw Error('誤り訂正データが一致しません。');
 return result;
}
export function renderPad(publicText,body,mask,version=PAD_VERSION){
 const q=plainPad(publicText,mask,version),info=layout(version),words=encoded(body,info),matrix=q.matrix.slice();
 info.indexes.forEach((p,i)=>{const r=Math.floor(p/info.n),c=p%info.n;
  matrix[p]=((words[i>>3]>>(7-i%8))&1)^Number(masked(mask,r,c));
 });
 return{matrix,plain:q.matrix};
}
export function padOffset(publicText,version=PAD_VERSION){
 // Byte mode uses a 16-bit character count for QR versions >= 10.
 layout(version);
 return Math.ceil((4+16+utf8(publicText).length*8+4)/8);
}
export function padCapacity(publicText,version=PAD_VERSION){
 const bytes=utf8(publicText).length;
 if(!bytes||bytes>150)return 0;
 return Math.max(0,layout(version).dataWords-padOffset(publicText,version)-14);
}
export function paddingVersionsFor(publicText,storedBytes){
 return PAD_VERSIONS.filter(v=>storedBytes<=padCapacity(publicText,v));
}
export const padInfo={version:PAD_VERSION,modules:PAD_N,dataWords:layout(PAD_VERSION).dataWords,
 blocks:layout(PAD_VERSION).count,parityPerBlock:layout(PAD_VERSION).each};
export function padVersionInfo(version){const l=layout(version);return{version,modules:l.n,dataWords:l.dataWords,blocks:l.count,parityPerBlock:l.each};}

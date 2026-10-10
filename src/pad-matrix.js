import QRCode from 'qrcode/lib/core/qrcode.js';
import Utils from 'qrcode/lib/core/utils.js';
import ECCode from 'qrcode/lib/core/error-correction-code.js';
import ECLevel from 'qrcode/lib/core/error-correction-level.js';
import ReedSolomonEncoder from 'qrcode/lib/core/reed-solomon-encoder.js';
import {utf8} from './core.js';

// Experimental Version 36, ECC M. The ordinary QR modes remain unchanged.
export const PAD_VERSION=36,PAD_N=161;
const total=Utils.getSymbolTotalCodewords(PAD_VERSION);
const count=ECCode.getBlocksCount(PAD_VERSION,ECLevel.M);
const parity=ECCode.getTotalCodewordsCount(PAD_VERSION,ECLevel.M);
const perParity=parity/count,dataWords=total-parity;
if(!Number.isInteger(perParity))throw Error('QR block definition mismatch');
const short=Math.floor(dataWords/count),long=total%count;
const lens=Array.from({length:count},(_,i)=>short+(i>=count-long?1:0));
export function plainPad(publicText,mask=0){
 if(!publicText.trim()||utf8(publicText).length>150)throw Error('表は150バイト以内にしてください。');
 const q=QRCode.create([{data:publicText,mode:'byte'}],{version:PAD_VERSION,errorCorrectionLevel:'M',maskPattern:mask});
 return{matrix:Uint8Array.from(q.modules.data),reserved:Uint8Array.from(q.modules.reservedBit)};
}
const template=plainPad('HELLO');
const indexes=(()=>{const result=[],allowed=template.reserved;let row=PAD_N-1,dir=-1;
 for(let right=PAD_N-1;right>0;right-=2){const col=right<=6?right-1:right;
  for(;;){for(const c of [col,col-1]){const p=row*PAD_N+c;if(!allowed[p])result.push(p);}
   row+=dir;if(row<0||row>=PAD_N){row-=dir;dir=-dir;break;}
  }
 }return result.slice(0,total*8);
})();
if(indexes.length!==total*8)throw Error('Unexpected QR mapping');
const masked=(mask,r,c)=>{switch(mask){
 case 0:return (r+c)%2===0;case 1:return r%2===0;
 case 2:return c%3===0;case 3:return (r+c)%3===0;
 case 4:return (Math.floor(r/2)+Math.floor(c/3))%2===0;
 case 5:return (r*c)%2+(r*c)%3===0;
 case 6:return ((r*c)%2+(r*c)%3)%2===0;
 case 7:return ((r*c)%3+(r+c)%2)%2===0;
 default:throw Error('Invalid QR mask');
}};
function interleaved(matrix,mask){
 const words=new Uint8Array(total);
 indexes.forEach((p,i)=>{const r=Math.floor(p/PAD_N),c=p%PAD_N;words[i>>3]|=(matrix[p]^Number(masked(mask,r,c)))<<(7-i%8);});
 return words;
}
export function dataBytes(matrix,mask){
 const words=interleaved(matrix,mask),chunks=lens.map(n=>new Uint8Array(n));
 let at=0;for(let i=0;i<Math.max(...lens);i++)for(const chunk of chunks)if(i<chunk.length)chunk[i]=words[at++];
 const result=new Uint8Array(dataWords);at=0;
 for(const chunk of chunks){result.set(chunk,at);at+=chunk.length;}
 return result;
}
function encoded(body){
 const coder=new ReedSolomonEncoder(perParity),chunks=[],ecc=[];let offset=0;
 for(const n of lens){const chunk=body.slice(offset,offset+n);chunks.push(chunk);ecc.push(coder.encode(chunk));offset+=n;}
 const result=new Uint8Array(total);let at=0;
 for(let i=0;i<Math.max(...lens);i++)for(const chunk of chunks)if(i<chunk.length)result[at++]=chunk[i];
 for(let i=0;i<perParity;i++)for(const block of ecc)result[at++]=block[i];
 return result;
}
export function renderPad(publicText,body,mask){
 const q=plainPad(publicText,mask),words=encoded(body),matrix=q.matrix.slice();
 indexes.forEach((p,i)=>{const r=Math.floor(p/PAD_N),c=p%PAD_N;
  matrix[p]=((words[i>>3]>>(7-i%8))&1)^Number(masked(mask,r,c));
 });
 return{matrix,plain:q.matrix};
}
export function padOffset(publicText){return Math.ceil((4+16+utf8(publicText).length*8+4)/8);}
export const padCapacity=publicText=>dataWords-padOffset(publicText)-14;
export const padInfo={version:PAD_VERSION,modules:PAD_N,dataWords,blocks:count,parityPerBlock:perParity};

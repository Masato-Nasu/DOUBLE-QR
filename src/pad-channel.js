// Experimental QR padding channel. This modifies data bytes after the
// ordinary QR terminator; compatibility with physical cameras is unverified.
import {utf8,concat,keys} from './core.js';
import {unpackHidden} from './compression.js';
import {plainPad,dataBytes,renderPad,padOffset,padCapacity,padVersionInfo,PAD_VERSION} from './pad-matrix.js';

const SIGNATURE=Uint8Array.from([68,81,80,49]);
export async function createPadding(publicText,hidden,key,prepared,mask=0,version=PAD_VERSION){
 const payload=prepared?.body??utf8(hidden),capacity=padCapacity(publicText,version);
 if(!key||!payload.length||payload.length>capacity)throw Error('裏データの容量または鍵を確認してください。');
 const {stream,mac}=await keys(publicText,key,payload.length);
 const encrypted=payload.map((b,i)=>b^stream[i]);
 const header=Uint8Array.of(payload.length>>8,payload.length&255);
 const signed=concat(utf8('DQR-padding-v1'),utf8(publicText),header,encrypted);
 const tag=new Uint8Array(await crypto.subtle.sign('HMAC',mac,signed)).slice(0,8);
 const bytes=concat(SIGNATURE,header,encrypted,tag);
 const ordinary=plainPad(publicText,mask,version);
 const buffer=dataBytes(ordinary.matrix,mask,version);
 buffer.set(bytes,padOffset(publicText,version));
 const result=renderPad(publicText,buffer,mask,version);
 const changed=result.matrix.reduce((n,v,i)=>n+(v!==result.plain[i]),0);
 const info=padVersionInfo(version),correction=Math.floor(info.parityPerBlock/2);
 const blocks=Array.from({length:info.blocks},(_,i)=>({block:i+1,changed_codewords:0,correction_limit:correction,remaining:correction}));
 return {...result,publicText,hiddenBytes:utf8(hidden).length,storedBytes:payload.length,compressed:!!prepared?.compressed,
 repetitions:1,qrVersion:version,layout:'padding',mask,
 budget:{changed_modules:changed,changed_percent:100*changed/result.matrix.length,min_remaining:correction,budget_ok:true,blocks}};
}
export async function readPadding(publicText,grid,key){
 const n=Math.sqrt(grid.length),version=(n-17)/4;
 if(!Number.isInteger(n)||!Number.isInteger(version)||version<12||version>36)throw Error('QRの形式が違います。');
 if(!key)throw Error('鍵が必要です。');
 for(let mask=0;mask<8;mask++){
  const bytes=dataBytes(grid,mask,version).slice(padOffset(publicText,version));
  if(!SIGNATURE.every((v,i)=>bytes[i]===v))continue;
  const size=(bytes[4]<<8)|bytes[5];
  if(size<1||size>padCapacity(publicText,version))continue;
  const encrypted=bytes.slice(6,6+size),tag=bytes.slice(6+size,14+size);
  const {stream,mac}=await keys(publicText,key,size);
  const data=concat(utf8('DQR-padding-v1'),utf8(publicText),bytes.slice(4,6),encrypted);
  const correct=new Uint8Array(await crypto.subtle.sign('HMAC',mac,data));
  let difference=0;
  for(let i=0;i<8;i++)difference|=correct[i]^tag[i];
  if(difference)throw Error('鍵またはデータが一致しません。');
  return {public:publicText,hidden:await unpackHidden(encrypted.map((v,i)=>v^stream[i])),repetitions:1,qrVersion:version};
 }
 throw Error('裏データが見つかりません。');
}

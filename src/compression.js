// Experimental, opt-in transparent DEFLATE for the hidden message.
// The marker starts with 0xFF, which can never be the first byte of
// valid UTF-8 text. Thus no existing v0.5 UTF-8 message is ambiguous.
import {utf8,concat} from './core.js';
export const COMPRESSED_MAGIC=Uint8Array.of(255,68,81,82,90,1); // FF D Q R Z 01
export const MAX_ORIGINAL_BYTES=30000;
const decoder=new TextDecoder('utf-8',{fatal:true});

async function transform(bytes,codec){
 const supported=codec==='compress'?'CompressionStream':'DecompressionStream';
 if(typeof globalThis[supported]!=='function')throw Error('このブラウザは圧縮したQRに対応していません。最新のSafariまたはChromeで開いてください。');
 const stream=new Blob([bytes]).stream().pipeThrough(new globalThis[supported]('deflate'));
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function prepareHidden(hidden,tryCompression=false){
 const raw=utf8(hidden);
 if(!raw.length)throw Error('裏の文章を入力してください。');
 if(raw.length>MAX_ORIGINAL_BYTES)throw Error('裏はUTF-8で30,000バイト以内にしてください。');
 let body=raw,compressed=false;
 if(tryCompression){
  const zipped=await transform(raw,'compress');
  if(zipped.length+COMPRESSED_MAGIC.length<raw.length){
   body=concat(COMPRESSED_MAGIC,zipped);
   compressed=true;
  }
 }
 return{body,originalBytes:raw.length,storedBytes:body.length,compressed};
}

export async function unpackHidden(body){
 if(body.length>=COMPRESSED_MAGIC.length&&COMPRESSED_MAGIC.every((v,i)=>body[i]===v)){
  const restored=await transform(body.slice(COMPRESSED_MAGIC.length),'decompress');
  if(restored.length>MAX_ORIGINAL_BYTES)throw Error('展開後の文章が上限を超えました。');
  return decoder.decode(restored);
 }
 return decoder.decode(body);
}

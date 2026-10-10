// Mandatory release gates for DOUBLE QR's ordinary black/white appearance.
// These are synthetic-image checks; photographed-screen and printed-image
// performance still require physical device tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPacked} from '../src/packed.js';
import {plainQR,pixels,VERSION,N} from '../src/core.js';
import {configureReader,decodeBoth,recover} from '../src/reader.js';
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});

test('do not imply arbitrary 5,000-character payloads can fit in a binary single QR',()=>{
 assert.equal(N,4*VERSION+17);
 assert.equal(4*40+17,177);
 assert(177*177 < 5000*8, 'even 5000 ASCII bytes exceed all physical binary cells');
 assert(177*177 < 5000*3*8, 'typical Japanese UTF-8 is even larger');
});

test('secret channel never changes finder, alignment, timing or format patterns',async()=>{
 const cases=[
  ['https://example.com','SECRET','demo-key',5],
  ['https://masato-lab.pages.dev/','あ'.repeat(10),'different-passphrase',3],
  ['https://example.com/hi','あ'.repeat(16),'screen-key',1]
 ];
 for(const [front,hidden,key,rep] of cases){
  const original=plainQR(front);
  const qr=await buildPacked(front,hidden,key,rep);
  assert.equal(qr.matrix.length,N*N);
  assert.equal(qr.budget.budget_ok,true);
  for(let i=0;i<qr.matrix.length;i++){
   assert(qr.matrix[i]===0||qr.matrix[i]===1,'plain two-tone modules only');
   if(original.reserved[i])assert.equal(qr.matrix[i],original.matrix[i],'reserved module must not change');
  }
  const image=pixels(qr.matrix),rgba=image.data;
  for(let i=0;i<rgba.length;i+=4){
   assert(rgba[i]===0||rgba[i]===255,'no new colors/gradients');
   assert.equal(rgba[i],rgba[i+1]);
   assert.equal(rgba[i],rgba[i+2]);
   assert.equal(rgba[i+3],255);
  }
  const input=new ImageData(image.data,image.width,image.height);
  const decoded=await decodeBoth(input);
  assert.equal(decoded.zxing?.public,front,'ZXing must read ordinary front');
  assert.equal(decoded.jsqr?.public,front,'jsQR must read ordinary front');
  assert.equal((await recover(input,key,rep,decoded)).hidden,hidden,'dedicated reader must recover hidden');
 }
});

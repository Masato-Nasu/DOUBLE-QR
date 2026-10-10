import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildPacked,maxPackedBytes,packedPositions,readGridPacked} from '../src/packed.js';
import {pixels} from '../src/core.js';
import {configureReader,verify,recover} from '../src/reader.js';
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});
test('capacity constraints are based on RS words with two words of margin',()=>{
 assert.equal(maxPackedBytes(1),123);
 assert.equal(maxPackedBytes(3),35);
 assert.equal(maxPackedBytes(5),17);
});
test('48-byte Japanese payload round trips and both standard decoders pass',async()=>{
 const front='https://masato-lab.pages.dev/',hidden='あ'.repeat(16),key='six-digit-key';
 const qr=await buildPacked(front,hidden,key,1);
 assert(qr.budget.budget_ok);
 assert(qr.budget.min_remaining>=2);
 assert.equal(qr.hiddenBytes,48);
 const recovered=await readGridPacked(front,qr.matrix,key,1);
 assert.equal(recovered.hidden,hidden);
 const p=pixels(qr.matrix),img=new ImageData(p.data,p.width,p.height);
 const result=await verify(img,front,hidden,key,1);
 assert.equal(result.zxing,true);
 assert.equal(result.jsqr,true);
 assert.equal(result.hidden,true);
 assert.equal((await recover(img,key,'auto')).hidden,hidden);
});
test('3x and 5x payloads decode, old layout remains unaffected',async()=>{
 const front='https://example.com',hidden='SECRET',key='demo-key';
 for(const rep of [3,5]){
  const q=await buildPacked(front,hidden,key,rep);
  assert.equal((await readGridPacked(front,q.matrix,key,rep)).hidden,hidden);
 }
 await assert.rejects(()=>buildPacked(front,'x'.repeat(36),key,3),/最大35/);
 await assert.rejects(()=>buildPacked(front,'x'.repeat(124),key,1),/最大123/);
});
test('wrong password cannot recover packed payload',async()=>{
 const front='https://example.com',q=await buildPacked(front,'SECRET','good-key',1);
 await assert.rejects(()=>readGridPacked(front,q.matrix,'bad-key',1));
 const loc=await packedPositions(front,'good-key');
 const damaged=q.matrix.slice();damaged[loc[14]]^=1;
 await assert.rejects(()=>readGridPacked(front,damaged,'good-key',1));
});

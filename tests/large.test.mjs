// Version 20/H experiments. Synthetic PNG checks are NOT a substitute
// for cross-device camera/print readability tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LARGE_N,LARGE_VERSION,plainLarge,buildLarge,readGridLarge,maxLargeBytes} from '../src/large.js';
import {maxPackedBytes} from '../src/packed.js';
import {pixels} from '../src/core.js';
import {decodeBoth,recover,configureReader,createCameraAccumulator} from '../src/reader.js';
import {prepareHidden} from '../src/compression.js';
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});

test('larger QR expands nominal payload budget but leaves ordinary patterns untouched',async()=>{
 assert.equal(LARGE_VERSION,20);
 assert.equal(LARGE_N,97);
 assert(maxLargeBytes(1)>maxPackedBytes(1));
 const front='https://masato-lab.pages.dev/';
 const hidden='ABCDEFGHIJ'.repeat(20); // 200 uncompressed bytes
 const q=await buildLarge(front,hidden,'demo-key',1);
 assert.equal(q.matrix.length,97*97);
 assert(q.budget.budget_ok);
 assert.equal(q.hiddenBytes,200);
 const ordinary=plainLarge(front);
 for(let i=0;i<q.matrix.length;i++)if(ordinary.reserved[i])
  assert.equal(q.matrix[i],ordinary.matrix[i],'must preserve standard QR reserved modules');
 const image=pixels(q.matrix,10),im=new ImageData(image.data,image.width,image.height);
 const codes=await decodeBoth(im);
 assert.equal(codes.zxing?.public,front);
 assert.equal(codes.jsqr?.public,front);
 assert.equal((await readGridLarge(front,q.matrix,'demo-key',1)).hidden,hidden);
 assert.equal((await recover(im,'demo-key','auto',codes)).hidden,hidden);
});
test('large QR also supports opt-in compressed text and wrong key rejection',async()=>{
 const front='https://example.com',hidden='本当に普通のQRの見た目を保ちます。'.repeat(200);
 const p=await prepareHidden(hidden,true);
 assert.equal(p.compressed,true);
 const q=await buildLarge(front,hidden,'large-secret',1,p);
 assert.equal((await readGridLarge(front,q.matrix,'large-secret',1)).hidden,hidden);
 await assert.rejects(()=>readGridLarge(front,q.matrix,'wrong-key',1));
});

test('multi-frame camera recovery supports large QR after independent image errors',async()=>{
 const front='https://example.com',hidden='ABCDE'.repeat(40),key='screen-large';
 const q=await buildLarge(front,hidden,key,1),raw=pixels(q.matrix,8);
 const im=new ImageData(raw.data,raw.width,raw.height);
 const detected=await decodeBoth(im),code=detected.zxing||detected.jsqr;
 assert(code?.corners,'standard reader must locate ordinary QR');
 const history=createCameraAccumulator();
 let seed=20261010;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let k=0;k<9;k++){
  const damaged=q.matrix.slice();
  for(let i=0;i<damaged.length;i++)if(rand()<.02)damaged[i]^=1;
  const x=pixels(damaged,8);
  history.add(new ImageData(x.data,x.width,x.height),code);
 }
 assert.equal((await history.recover(key,1)).hidden,hidden);
 history.reset();assert.equal(history.count,0);
});

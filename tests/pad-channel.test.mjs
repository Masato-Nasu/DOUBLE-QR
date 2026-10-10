import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareHidden} from '../src/compression.js';
import {createPadding,readPadding} from '../src/pad-channel.js';
import {padCapacity,PAD_N,plainPad,padInfo} from '../src/pad-matrix.js';
import {pixels} from '../src/core.js';
import {configureReader,decodeBoth,recover,verify} from '../src/reader.js';

globalThis.ImageData=class {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});

test('1679 bytes fit inside padding and recover with authenticated key',async()=>{
 const front='https://masato-lab.pages.dev/',hidden='ABCD'.repeat(419)+'XYZ',key='secret-key';
 assert.equal(hidden.length,1679);
 assert(padCapacity(front)>=1679);
 const q=await createPadding(front,hidden,key,null,1);
 assert.equal(q.matrix.length,PAD_N*PAD_N);
 assert.equal(q.storedBytes,1679);
 assert.equal((await readPadding(front,q.matrix,key)).hidden,hidden);
 await assert.rejects(()=>readPadding(front,q.matrix,'wrong-password'),/鍵またはデータ/);
 const standard=plainPad(front,1);
 for(let i=0;i<q.matrix.length;i++)if(standard.reserved[i])
  assert.equal(q.matrix[i],standard.matrix[i],'QR finder and other function modules must remain ordinary');
});

test('both public QR decoders and dedicated hidden reader accept at least one normal mask',async()=>{
 const front='https://masato-lab.pages.dev/',hidden='ABCD'.repeat(419)+'XYZ',key='test-key';
 let accepted=null;
 for(let mask=0;mask<8;mask++){
  const q=await createPadding(front,hidden,key,null,mask);
  const p=pixels(q.matrix,8,4);
  const im=new ImageData(p.data,p.width,p.height);
  const checks=await verify(im,front,hidden,key,1);
  if(checks.zxing&&checks.jsqr&&checks.hidden){accepted={q,checks};break;}
 }
 assert(accepted,'At least one mask must be ordinary-reader-compatible in clean PNG');
 assert.equal(accepted.q.layout,'padding');
});

test('long compressed Japanese message can be recovered losslessly',async()=>{
 const front='https://example.com',hidden='秘密の文章は通常のQRには見えません。'.repeat(200),key='compression-key';
 const packed=await prepareHidden(hidden,true);
 assert(packed.compressed);
 const q=await createPadding(front,hidden,key,packed,1);
 assert.equal((await readPadding(front,q.matrix,key)).hidden,hidden);
});

test('oversized compressed data is rejected instead of rendering unreadable QR',async()=>{
 const front='https://example.com',key='my-key';
 let rng=0x19581231;
 const letters='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
 const long=Array.from({length:6000},()=>{rng^=rng<<13;rng^=rng>>>17;rng^=rng<<5;return letters[(rng>>>0)%letters.length];}).join('');
 const packed=await prepareHidden(long,true);
 assert(packed.storedBytes>padCapacity(front));
 await assert.rejects(()=>createPadding(front,long,key,packed,1),/容量または鍵/);
});

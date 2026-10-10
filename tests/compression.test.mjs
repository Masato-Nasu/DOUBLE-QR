// Browser-native compression tests (synthetic QR image; not device-camera tests).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareHidden,unpackHidden} from '../src/compression.js';
import {buildPacked,maxPackedBytes} from '../src/packed.js';
import {pixels} from '../src/core.js';
import {configureReader,verify,recover} from '../src/reader.js';
globalThis.ImageData=class {constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});

test('repetitive Japanese 5000 characters can be stored losslessly if compression fits',async()=>{
 const hidden='秘密'.repeat(2500); // 5,000 Japanese characters, ~15KB of UTF-8
 const prepared=await prepareHidden(hidden,true);
 assert.equal(prepared.originalBytes,15000);
 assert.equal(prepared.compressed,true);
 assert(prepared.storedBytes<=maxPackedBytes(1));
 assert.equal(await unpackHidden(prepared.body),hidden);
 const front='https://masato-lab.pages.dev/',key='compression-regression';
 const qr=await buildPacked(front,hidden,key,1,prepared);
 assert.equal(qr.budget.budget_ok,true);
 assert.equal(qr.hiddenBytes,15000);
 assert.equal(qr.storedBytes,prepared.storedBytes);
 const img=pixels(qr.matrix),image=new ImageData(img.data,img.width,img.height);
 const checks=await verify(image,front,hidden,key,1);
 assert.equal(checks.zxing,true);assert.equal(checks.jsqr,true);assert.equal(checks.hidden,true);
 assert.equal((await recover(image,key,1)).hidden,hidden);
});

test('compression does not alter the legacy uncompressed path',async()=>{
 const front='https://example.com',hidden='SECRET',key='demo-key';
 const prep=await prepareHidden(hidden,true);
 assert.equal(prep.compressed,false);
 assert.equal(await unpackHidden(prep.body),'SECRET');
 const a=await buildPacked(front,hidden,key,1);
 const b=await buildPacked(front,hidden,key,1,prep);
 assert.deepEqual(a.matrix,b.matrix,'uncompressed QR must be byte-for-byte identical');
});

test('compression does not pretend incompressible messages fit',async()=>{
 let x=0x1234abcd;
 const chars='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
 const text=Array.from({length:800},()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return chars[(x>>>0)%chars.length];}).join('');
 const prep=await prepareHidden(text,true);
 assert(prep.storedBytes>maxPackedBytes(1),'random-like 800-character text should still exceed capacity');
 await assert.rejects(()=>buildPacked('https://example.com',text,'key',1,prep),/最大123/);
});

test('compressed marker cannot collide with ordinary UTF-8 text',async()=>{
 const normal='普通の文章で保存しています。';
 const prep=await prepareHidden(normal,false);
 assert.notEqual(prep.body[0],255);
 assert.equal(await unpackHidden(prep.body),normal);
});

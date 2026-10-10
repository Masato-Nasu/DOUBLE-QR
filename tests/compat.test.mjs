import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {PNG} from 'pngjs';
import {build,positions,readGrid,pixels,plainQR} from '../src/core.js';
import {configureReader,recover,decodeBoth,verify} from '../src/reader.js';
globalThis.ImageData=class ImageData{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
const wasm=fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm');configureReader({wasmBinary:wasm});
const fixtures=JSON.parse(fs.readFileSync('tests/legacy-fixtures.json'));
for(const [index,f] of fixtures.entries()){
 test(`Python v0.4 pixel / positions / payload compatibility ${index}`,async()=>{
  const q=await build(f.public,f.hidden,f.key,f.repetitions);
  assert.deepEqual([...q.plain],f.plain);assert.deepEqual([...q.matrix],f.double);
  assert.deepEqual((await positions(f.public,f.key,f.repetitions)).map(i=>[Math.floor(i/65),i%65]),f.positions);
  assert.equal(q.budget.min_remaining,f.budget.min_remaining);assert.equal(q.budget.changed_modules,f.budget.changed_modules);
  assert.equal((await readGrid(f.public,q.matrix,f.key,f.repetitions)).hidden,f.hidden);
 });
 test(`Read previous Python PNG ${index}`,async()=>{
  const p=PNG.sync.read(fs.readFileSync(`tests/legacy-${index}.png`));const image=new ImageData(new Uint8ClampedArray(p.data),p.width,p.height);
  assert.equal((await recover(image,f.key,'auto')).hidden,f.hidden);
  const codes=await decodeBoth(image);assert.equal(codes.zxing.public,f.public);assert.equal(codes.jsqr.public,f.public);
 });
}
test('wrong key and modified payload rejected',async()=>{const f=fixtures[0],q=await build(f.public,f.hidden,f.key,1);await assert.rejects(()=>readGrid(f.public,q.matrix,'wrong',1));const pos=await positions(f.public,f.key);q.matrix[pos[20]]^=1;await assert.rejects(()=>readGrid(f.public,q.matrix,f.key,1));});
test('majority decoding corrects damaged first header and body',async()=>{for(const rep of [3,5]){const f=fixtures[0],q=await build(f.public,f.hidden,f.key,rep),loc=await positions(f.public,f.key,rep);for(const i of [0,1,8,15,38])q.matrix[loc[i]]^=1;assert.equal((await readGrid(f.public,q.matrix,f.key,rep)).hidden,f.hidden);}});
test('input bounds and budget guard data',async()=>{await assert.rejects(()=>build('','SECRET','key'));await assert.rejects(()=>build('hello','','key'));await assert.rejects(()=>build('hello','a'.repeat(256),'key'));await assert.rejects(()=>build('hello','text',''));assert.equal((await build('https://example.com','x'.repeat(100),'demo-key',1)).budget.budget_ok,false);});

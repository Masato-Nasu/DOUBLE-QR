import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plainPad,dataBytes,renderPad,padOffset,padCapacity,padInfo,padVersionInfo,paddingVersionsFor} from '../src/pad-matrix.js';
test('Version 36/M standard QR is reconstructed without altering any module',()=>{
 const front='https://masato-lab.pages.dev/';
 assert.equal(padInfo.modules,161);
 assert.equal(padInfo.dataWords,1914);
 assert.equal(padOffset(front),32);
 assert.equal(padCapacity(front),1868);
 for(const mask of [0,1,3,6,7]){
  const standard=plainPad(front,mask);
  const data=dataBytes(standard.matrix,mask);
  assert.equal(data.length,1914);
  const restored=renderPad(front,data,mask);
  assert.deepEqual(restored.matrix,standard.matrix);
 }
});

test('variable QR versions reconstruct canonical matrices with all reserved modules',()=>{
 const publicText='https://masato-lab.pages.dev/';
 for(const version of [12,13,16,20,25,30,34,35,36]){
  const info=padVersionInfo(version);
  for(const mask of [0,1,3,7]){
   const plain=plainPad(publicText,mask,version),bytes=dataBytes(plain.matrix,mask,version);
   assert.equal(bytes.length,info.dataWords);
   assert.deepEqual(renderPad(publicText,bytes,mask,version).matrix,plain.matrix);
  }
 }
});
test('automatic sizing capacity is monotonic and picks the smallest eligible QR',()=>{
 const front='https://masato-lab.pages.dev/';
 let previous=0;
 for(let version=12;version<=36;version++){
  const max=padCapacity(front,version);
  assert(max>previous,'each larger QR must offer more hidden payload capacity');
  previous=max;
 }
 for(const length of [1,50,180,300,500,800,1200,1679,1850]){
  const versions=paddingVersionsFor(front,length);
  assert(versions.length>0,`auto must support ${length} B`);
  assert.equal(versions[0],Array.from({length:25},(_,i)=>i+12).find(v=>padCapacity(front,v)>=length));
  assert.equal(padCapacity(front,versions[0])>=length,true);
 }
 assert.deepEqual(paddingVersionsFor(front,2000),[]);
});

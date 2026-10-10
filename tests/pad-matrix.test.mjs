import {test} from 'node:test';
import assert from 'node:assert/strict';
import {plainPad,dataBytes,renderPad,padOffset,padCapacity,padInfo} from '../src/pad-matrix.js';
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

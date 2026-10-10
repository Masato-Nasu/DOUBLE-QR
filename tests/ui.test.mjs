// DOM unit tests with mocked canvas; these are not browser or phone tests.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {PNG} from 'pngjs';
import {configureReader} from '../src/reader.js';
const dom=new JSDOM(fs.readFileSync('dist/index.html','utf8'),{url:'https://test.invalid/'});
for(const name of ['window','document','location','localStorage','sessionStorage'])globalThis[name]=dom.window[name];
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true});
globalThis.matchMedia=()=>({matches:false});
globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
const frames=new WeakMap();
dom.window.HTMLCanvasElement.prototype.getContext=function(){return{putImageData:image=>frames.set(this,image),fillRect(){},drawImage:image=>frames.set(this,image),getImageData:()=>frames.get(this)};};
dom.window.HTMLCanvasElement.prototype.toBlob=function(callback){const image=frames.get(this);callback(new Blob([PNG.sync.write({width:image.width,height:image.height,data:Buffer.from(image.data)})],{type:'image/png'}));};
await import('../src/app.js');
configureReader({wasmBinary:fs.readFileSync('node_modules/zxing-wasm/dist/reader/zxing_reader.wasm')});
const $=id=>document.getElementById(id);
const submit={preventDefault(){}};
test('simple tabs transfer key and preserve fields',()=>{
 $('key').value='demo-key';$('readTab').click();assert.equal($('readPanel').hidden,false);assert.equal($('makePanel').hidden,true);assert.equal($('readKey').value,'demo-key');$('makeTab').click();assert.equal($('makePanel').hidden,false);
});
test('generate verified PNG, invalidate on input, show capacity and block oversized payload',async()=>{
 await $('maker').onsubmit(submit);assert.match($('makeStatus').textContent,/通過しました/);assert.equal($('output').hidden,false);assert.equal($('save').hidden,false);assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('hidden').value='x'.repeat(124);$('hidden').dispatchEvent(new dom.window.Event('input',{bubbles:true}));assert.equal($('output').hidden,true);await $('maker').onsubmit(submit);assert.equal($('output').hidden,true);assert.match($('makeStatus').textContent,/最大123バイト/);
 $('hidden').value='SECRET';
});
test('48-byte Japanese message auto-selects 1x and keeps public QR readable',async()=>{
 $('public').value='https://masato-lab.pages.dev/';
 $('hidden').value='あ'.repeat(16);
 $('hidden').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.match($('byteCount').textContent,/48 \\/ 123 bytes/);
 assert.equal($('rep').value,'auto');
 await $('maker').onsubmit(submit);
 assert.match($('makeStatus').textContent,/1重・自動選択/);
 assert.equal($('save').hidden,false);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
});
test('upload previous PNG, restore SECRET and reject wrong key',async()=>{
 const p=PNG.sync.read(fs.readFileSync('tests/legacy-0.png'));globalThis.createImageBitmap=async()=>new ImageData(new Uint8ClampedArray(p.data),p.width,p.height);
 Object.defineProperty($('file'),'files',{value:[{size:1000}]});$('readKey').value='demo-key';await $('file').onchange();assert.equal($('publicResult').textContent,'https://example.com');assert.equal($('secretResult').textContent,'SECRET');assert.equal($('secretMessage').hidden,false);
 $('readKey').value='wrong';await $('readAgain').onclick();assert.equal($('secretMessage').hidden,true);assert.equal($('readStatus').classList.contains('error'),true);
});
test('manual evidence is separate and stores neither keys nor messages',()=>{
 $('phoneSet').value='test';$('phoneDevice').value='unit fixture';$('phoneConditions').value='simulated DOM';$('phoneForm').onsubmit(submit);const rows=JSON.parse(localStorage.getItem('double-qr-pwa-device-trials'));assert.equal(rows.length,1);assert.equal(rows[0].evidence,'user_reported_device_test');assert.equal(rows[0].bytes,0);assert.equal(rows[0].rep,0);assert.equal('key'in rows[0],false);assert.equal('hidden'in rows[0],false);$('phoneUndo').click();assert.deepEqual(JSON.parse(localStorage.getItem('double-qr-pwa-device-trials')),[]);
});

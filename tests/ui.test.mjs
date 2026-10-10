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
test('requested poem, public URL and automatic size are initial defaults',()=>{
 assert.equal($('public').value,'https://masato-lab.pages.dev/');
 assert.equal($('hidden').value,'合歓の木の 在りて終日 三途にて');
 assert.equal($('qrVersion').value,'auto');
 assert.equal($('compression').value,'auto');
 // Preserve all prior normal QR regressions in their explicitly selected mode.
 $('qrVersion').value='12';$('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='off';
 $('public').value='https://example.com';$('hidden').value='SECRET';
});
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
 assert.equal($('byteCount').textContent,'48 / 123 bytes');
 assert.equal($('rep').value,'auto');
 await $('maker').onsubmit(submit);
 assert.match($('makeStatus').textContent,/1重・自動選択/);
 assert.equal($('save').hidden,false);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
});
test('screen reading opens a full-screen view and keeps QR complete',()=>{
 const dialog=$('zoom');
 dialog.showModal=()=>{dialog.open=true;};
 dialog.close=()=>{dialog.open=false;};
 const screenButton=$('enlarge');
 assert.equal(screenButton.hidden,false);
 assert(screenButton.compareDocumentPosition($('qr')) & 4,'button is before the QR');
 screenButton.click();
 assert.equal(dialog.open,true);
 assert.match($('zoomImage').src,/^blob:/);
 $('closeZoom').click();
 assert.equal(dialog.open,false);
});
test('invalid strength never leaves a QR shown for scanning',async()=>{
 $('rep').value='5';
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,true);
 assert.match($('makeStatus').textContent,/自動/);
 $('rep').value='auto';
});
test('experimental larger QR keeps ordinary version 12 as default',async()=>{
 assert.equal($('qrVersion').value,'12');
 $('qrVersion').value='20';
 $('public').value='https://example.com';
 $('hidden').value='ABCDE'.repeat(40); // 200 bytes uncompressed
 $('hidden').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.match($('byteCount').textContent,/200/);
 $('compression').value='off';
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,false);
 assert.match($('makeStatus').textContent,/実験機能/);
 assert.equal($('qr').width,(97+12)*14);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('qrVersion').value='12';$('hidden').value='SECRET';
});
test('opt-in compression reports stored size and successfully decodes long Japanese',async()=>{
 $('qrVersion').value='12';
 $('compression').value='auto';
 $('public').value='https://example.com';
 $('hidden').value='秘密'.repeat(2500);
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,false);
 assert.match($('makeStatus').textContent,/圧縮: 15000 →/);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('compression').value='off';$('hidden').value='SECRET';
});
test('opt-in Version 36 accepts 1679 bytes with ordinary and hidden QR checks',async()=>{
 $('public').value='https://masato-lab.pages.dev/';
 $('hidden').value='ABCD'.repeat(419)+'XYZ';
 $('key').value='screen-lab-key';
 $('qrVersion').value='36';
 $('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='off';
 $('rep').value='auto';
 $('hidden').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 assert.match($('byteCount').textContent,/1679/);
 assert.match($('byteCount').textContent,/1868/);
 assert.equal($('rep').disabled,true);
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,false,$('makeStatus').textContent);
 assert.match($('makeStatus').textContent,/Version 36/);
 assert.equal($('qr').width,(161+12)*14);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('qrVersion').value='12';
 $('qrVersion').dispatchEvent(new dom.window.Event('change'));
 assert.equal($('rep').disabled,false);
 $('hidden').value='SECRET';
 $('public').value='https://example.com';
 $('key').value='demo-key';
});
test('auto size picks a compact version and still restores the whole message',async()=>{
 $('qrVersion').value='auto';$('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='auto';
 $('public').value='https://masato-lab.pages.dev/';
 $('hidden').value='合歓の木の 在りて終日 三途にて';
 $('key').value='auto-size-key';
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,false,$('makeStatus').textContent);
 assert.match($('makeStatus').textContent,/自動サイズ・Version 12/);
 assert.equal($('qr').width,(65+12)*14);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('qrVersion').value='12';$('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='off';$('hidden').value='SECRET';$('public').value='https://example.com';
});
test('auto size expands to fit 1679 bytes instead of rejecting at 255',async()=>{
 $('qrVersion').value='auto';$('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='off';
 $('public').value='https://masato-lab.pages.dev/';
 $('hidden').value='ABCD'.repeat(419)+'XYZ';
 $('key').value='auto-expand-key';
 await $('maker').onsubmit(submit);
 assert.equal($('output').hidden,false,$('makeStatus').textContent);
 assert.match($('makeStatus').textContent,/自動サイズ・Version (3[0-6])/);
 assert.equal(document.querySelectorAll('#checks .success').length,3);
 $('qrVersion').value='12';$('qrVersion').dispatchEvent(new dom.window.Event('change'));
 $('compression').value='off';$('hidden').value='SECRET';$('public').value='https://example.com';
});
test('upload previous PNG, restore SECRET and reject wrong key',async()=>{
 const p=PNG.sync.read(fs.readFileSync('tests/legacy-0.png'));globalThis.createImageBitmap=async()=>new ImageData(new Uint8ClampedArray(p.data),p.width,p.height);
 Object.defineProperty($('file'),'files',{value:[{size:1000}]});$('readKey').value='demo-key';await $('file').onchange();assert.equal($('publicResult').textContent,'https://example.com');assert.equal($('secretResult').textContent,'SECRET');assert.equal($('secretMessage').hidden,false);
 $('readKey').value='wrong';await $('readAgain').onclick();assert.equal($('secretMessage').hidden,true);assert.equal($('readStatus').classList.contains('error'),true);
});
test('manual evidence is separate and stores neither keys nor messages',()=>{
 $('phoneSet').value='test';$('phoneDevice').value='unit fixture';$('phoneConditions').value='simulated DOM';$('phoneForm').onsubmit(submit);const rows=JSON.parse(localStorage.getItem('double-qr-pwa-device-trials'));assert.equal(rows.length,1);assert.equal(rows[0].evidence,'user_reported_device_test');assert.equal(rows[0].bytes,0);assert.equal(rows[0].rep,0);assert.equal('key'in rows[0],false);assert.equal('hidden'in rows[0],false);$('phoneUndo').click();assert.deepEqual(JSON.parse(localStorage.getItem('double-qr-pwa-device-trials')),[]);
});

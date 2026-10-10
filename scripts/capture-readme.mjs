// Capture the actual running PWA for README documentation.
// The screenshot is generated from the app, not an edited mockup.
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:528,height:1600},deviceScaleFactor:1});
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle',timeout:30000});
 await page.locator('#key').fill('documentation-example-key');
 await page.locator('#generate').click();
 await page.waitForFunction(()=>{
  const status=document.getElementById('makeStatus')?.textContent??'';
  if(status.includes('作成しました'))return true;
  if(status.includes('失敗')||status.includes('できません'))throw Error(status);
  return false;
 },null,{timeout:90000});
 await page.locator('#output').waitFor({state:'visible'});
 await page.locator('#save').waitFor({state:'visible'});
 // Only the visible initial controls + generated QR + actions; skip diagnostics footer.
 const end=await page.locator('#output .actions').boundingBox();
 if(!end)throw Error('Screenshot bounds are missing');
 const height=Math.ceil(end.y+end.height+24);
 if(height<900||height>2400)throw Error('Unexpected screenshot height: '+height);
 await page.screenshot({path:'docs/screenshots/generate.png',clip:{x:0,y:0,width:528,height},animations:'disabled'});
 console.log(JSON.stringify({screenshot:'docs/screenshots/generate.png',height,version:await page.locator('#qrVersion').inputValue(),public:await page.locator('#public').inputValue(),hidden:await page.locator('#hidden').inputValue()}));
}finally{await browser.close();}

import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(new URL('../../apps/frontend/package.json', import.meta.url));
const {chromium}=require('playwright');
const origin=process.env.HOMENAS_TEST_ORIGIN;
const username=process.env.HOMENAS_TEST_USERNAME;
for (const name of ['HOMENAS_TEST_ORIGIN','HOMENAS_TEST_USERNAME','HOMENAS_TEST_PASSWORD']) {
 if (!process.env[name]) throw new Error(name+' is required');
}
const browser=await chromium.launch(process.env.CHROMIUM_EXECUTABLE ? {executablePath:process.env.CHROMIUM_EXECUTABLE} : {});
try {
 const page=await browser.newPage({ignoreHTTPSErrors:true});
 const errors=[];page.on('pageerror',()=>errors.push('pageerror'));
 await page.goto(origin+'/login');
 await page.locator('input[autocomplete="username"]').fill(username);
 await page.locator('input[autocomplete="current-password"]').fill(process.env.HOMENAS_TEST_PASSWORD);
 await page.locator('button[type="submit"]').click();
 await page.waitForURL(origin+'/',{timeout:15000});
 const paths=['/api/auth/me','/api/setup/status','/api/system/metrics','/api/storage/disks','/api/storage/mergerfs/status','/api/network/samba/shares','/api/docker/containers','/api/cloud-backup/jobs'];
 for(const path of paths){
  const result=await page.evaluate(async path=>{
   const state=JSON.parse(sessionStorage.getItem('homenas-auth')).state;
   const response=await fetch(path,{headers:{'X-Session-Id':state.sessionId},signal:AbortSignal.timeout(15000)});
   const body=await response.json();
   return {status:response.status,rows:Array.isArray(body)?body.length:undefined,pool:path.includes('mergerfs')?{...body,usedBytes:undefined,drives:body.drives.map(({usedBytes,...drive})=>drive)}:undefined};
  },path);
  console.log(JSON.stringify({path,...result}));assert.equal(result.status,200,path);if(result.pool){assert.equal(result.pool.mountPoint,'/mnt/pool');assert.equal(result.pool.drives.filter(d=>d.role==='cache').length,1);assert.ok(result.pool.drives.some(d=>d.path==='/mnt/disks/cache1/pool-cache'));}
 }
 for(const path of ['/storage','/docker','/network','/cloud-backup']){
  await page.goto(origin+path);await page.waitForTimeout(1200);assert.ok(!page.url().includes('/login'));console.log('VIEW PASS '+path);
 }
 assert.equal(errors.length,0);console.log('PASS real remote browser login+8 APIs+4 views; read-only NAS operations');
 await page.evaluate(async()=>{const state=JSON.parse(sessionStorage.getItem('homenas-auth')).state;await fetch('/api/auth/logout',{method:'POST',headers:{'X-Session-Id':state.sessionId,'X-CSRF-Token':state.csrfToken}})});
}finally{await browser.close()}

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
  console.log(JSON.stringify({path,...result}));assert.equal(result.status,200,path);
 }
 const fileChecks=await page.evaluate(async()=>{
  const state=JSON.parse(sessionStorage.getItem('homenas-auth')).state;
  const headers={'X-Session-Id':state.sessionId,'X-CSRF-Token':state.csrfToken};
  const fixture='/mnt/storage/.homenas-repair-test-20261001';
  const results=[];
  async function json(path,method,payload){const r=await fetch('/api/files/'+path,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(path+' status '+r.status);results.push(path+':'+r.status)}
  const expected={'empty.txt':'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855','contenido con espacios.txt':'7ce2472b940c01e319adb76c346a814c6b5cbb50d077e687cbe42187ba918b92','unicode-ñ.txt':'f363e8366012722cd94d90a4fcd79f2c02c78275b4af67a7ddb55892632c87bc'};
  for(const [name,digest]of Object.entries(expected)){
   const r=await fetch('/api/files/download?path='+encodeURIComponent(fixture+'/'+name),{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('download '+r.status);
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await r.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==digest)throw Error('hash mismatch');results.push('download hash:'+name);
  }
  const form=new FormData();form.append('file',new Blob(['Temporary upload verification\n'.repeat(40000)]),'upload.txt');form.append('empty',new Blob([]),'uploaded-empty.txt');form.append('path',fixture);
  const upload=await fetch('/api/files/upload',{method:'POST',headers,body:form,signal:AbortSignal.timeout(20000)});if(upload.status!==201)throw Error('upload status '+upload.status);results.push('upload201');
  await json('rename','POST',{oldPath:fixture+'/upload.txt',newPath:fixture+'/renamed.txt'});
  await json('copy','POST',{source:fixture+'/renamed.txt',destination:fixture+'/copied.txt'});
  await json('mkdir','POST',{path:fixture+'/subdir'});
  await json('move','POST',{source:fixture+'/copied.txt',destination:fixture+'/subdir/moved.txt'});
  const moved=await fetch('/api/files/download?path='+encodeURIComponent(fixture+'/subdir/moved.txt'),{headers,signal:AbortSignal.timeout(15000)});if(moved.status!==200||(await moved.text())!=='Temporary upload verification\n'.repeat(40000))throw Error('moved content mismatch');results.push('move/copy contentsPASS');
  const db=await fetch('/api/system/db-backup',{headers,signal:AbortSignal.timeout(15000)});if(db.status!==200||new TextDecoder().decode((await db.arrayBuffer()).slice(0,16))!=='SQLite format 3\0')throw Error('SQLite download invalid');results.push('SQLite backupPASS');
  const missing=await fetch('/api/nonexistent',{headers});if(missing.status!==404)throw Error('API404 failed');
  await json('item','DELETE',{path:fixture});
  return results;
 });console.log('FILES PASS '+JSON.stringify(fileChecks));
 for(const path of ['/storage','/docker','/network','/cloud-backup']){
  await page.goto(origin+path);await page.waitForTimeout(1200);assert.ok(!page.url().includes('/login'));console.log('VIEW PASS '+path);
 }
 assert.equal(errors.length,0);console.log('PASS real remote browser login+8 APIs+4 views; read-only NAS operations');
 await page.evaluate(async()=>{const state=JSON.parse(sessionStorage.getItem('homenas-auth')).state;await fetch('/api/auth/logout',{method:'POST',headers:{'X-Session-Id':state.sessionId,'X-CSRF-Token':state.csrfToken}})});
}finally{await browser.close()}

// Real compiled HTTPS server + served React + real 2FA, with isolated SQLite.
// Monitoring endpoints are blocked in the browser to avoid host service calls.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { execFile, spawn } from 'node:child_process'
import { request } from 'node:https'
import { createServer as tcpServer } from 'node:net'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { TOTP, Secret } from 'otpauth'

const exec = promisify(execFile)
const root = resolve('../..') // pnpm filter exec runs in apps/backend
const temp = await mkdtemp(join(tmpdir(), 'homenas-production-test-'))
const reserve = tcpServer()
await new Promise<void>(done => reserve.listen(0, '127.0.0.1', done))
const port = (reserve.address() as { port: number }).port
await new Promise<void>(done => reserve.close(() => done()))
const origin = `https://127.0.0.1:${port}`
let child: ReturnType<typeof spawn> | undefined, browser: any
try {
  await exec('openssl', ['req','-x509','-nodes','-newkey','rsa:2048','-keyout',join(temp,'key.pem'),'-out',join(temp,'cert.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'])
  child = spawn(process.execPath, ['dist/apps/backend/src/server.js'], { cwd: join(root,'apps/backend'), env: { ...process.env, NODE_ENV:'production', HOST:'127.0.0.1', PORT:String(port), CERT_PATH:join(temp,'cert.pem'), KEY_PATH:join(temp,'key.pem'), HOMENAS_DATA_DIR:temp, HOMENAS_LOG_DIR:join(temp,'logs'), LOG_LEVEL:'silent' }, stdio: ['ignore','pipe','pipe'] })
  let output = ''
  child.stdout?.on('data', chunk => { output += chunk })
  child.stderr?.on('data', chunk => { output += chunk })
  function get(path: string): Promise<{ status: number, body: string, headers: Record<string,unknown> }> {
    return new Promise((done, fail) => {
      request(origin+path, { rejectUnauthorized:false }, response => {
        let body='';response.on('data',chunk=>{body+=chunk});response.on('end',()=>done({status:response.statusCode!,body,headers:response.headers}))
      }).on('error', fail).end()
    })
  }
  let ready = false
  for (let attempt=0;attempt<60;attempt++) {
    try { ready = (await get('/api/health')).status === 200 } catch {}
    if (ready) break
    if (child.exitCode !== null) throw new Error(`Server exited: ${output}`)
    await new Promise(done=>setTimeout(done,100))
  }
  assert.ok(ready, `Compiled server did not start: ${output}`)
  assert.equal((await get('/')).status,200)
  assert.match((await get('/login')).body, /<div id="root">/)
  const missing = await get('/api/nonexistent')
  assert.equal(missing.status,404);assert.equal(JSON.parse(missing.body).error,'Not Found')
  const db = new Database(join(temp,'homenas.db'))
  const secret = new Secret()
  db.prepare('UPDATE users SET password_hash=?,totp_secret=?,totp_enabled=1 WHERE username=?').run(bcrypt.hashSync('Production9Password',10),secret.base32,'admin')
  db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES ('setup_complete','1')").run()
  db.close()
  const require = createRequire(join(root,'apps/frontend/package.json'))
  const { chromium } = require('playwright')
  browser = await chromium.launch({ ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
  const page = await browser.newPage({ ignoreHTTPSErrors:true })
  await page.route('**/api/**', (route: any) => {
    const pathname=new URL(route.request().url()).pathname
    if (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/setup/status') || pathname==='/api/health' || pathname.startsWith('/api/active-backup/devices') || pathname==='/api/system/db-backup') return route.continue()
    return route.fulfill({status:503,json:{message:'Monitoring disabled in isolated production smoke'}})
  })
  await page.goto(origin+'/login')
  await page.locator('input[autocomplete="username"]').fill('admin')
  await page.locator('input[autocomplete="current-password"]').fill('Production9Password')
  await page.locator('button[type="submit"]').click()
  await page.locator('input[autocomplete="one-time-code"]').fill(new TOTP({secret,algorithm:'SHA1',digits:6,period:30}).generate())
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(origin+'/')
  const me = await page.evaluate(async () => {
    const store = JSON.parse(sessionStorage.getItem('homenas-auth')!)
    const response = await fetch('/api/auth/me',{headers:{'X-Session-Id':store.state.sessionId}})
    return {status:response.status,user:await response.json()}
  })
  assert.equal(me.status,200);assert.equal(me.user.username,'admin')
  const downloads = await page.evaluate(async () => {
    const state = JSON.parse(sessionStorage.getItem('homenas-auth')!).state
    const headers = { 'X-Session-Id': state.sessionId, 'X-CSRF-Token': state.csrfToken, 'Content-Type': 'application/json' }
    const created = await fetch('/api/active-backup/devices',{method:'POST',headers,body:JSON.stringify({name:'prod-download',hostname:'localhost',os_type:'windows'})})
    const device = await created.json()
    const responses = []
    for (const [platform, arch] of [['windows','amd64'],['linux','amd64'],['linux','arm64'],['mac','amd64'],['mac','arm64']]) {
      const response = await fetch(`/api/active-backup/devices/${device.id}/agent-package?platform=${platform}&arch=${arch}`,{headers,signal:AbortSignal.timeout(15000)})
      responses.push({status:response.status,type:response.headers.get('content-type'),size:(await response.arrayBuffer()).byteLength})
    }
    const invalid = await fetch(`/api/active-backup/devices/${device.id}/agent-package?platform=windows&arch=arm64`,{headers})
    const db = await fetch('/api/system/db-backup',{headers})
    return { created:created.status, responses, invalid:invalid.status, dbStatus:db.status, dbSize:(await db.arrayBuffer()).byteLength }
  })
  assert.equal(downloads.created,201);for (const response of downloads.responses) {assert.equal(response.status,200);assert.equal(response.type,'application/zip');assert.ok(response.size>1000)};assert.equal(downloads.invalid,400)
  assert.equal(downloads.dbStatus,200);assert.ok(downloads.dbSize>1000)
  assert.ok((await get('/')).headers['strict-transport-security'])
  console.log('PASS compiled HTTPS server + production React static/fallback + real login/TOTP/session + API404 + security headers + compiled agent ZIP/database downloads; temp DB/cert/logs, host monitoring blocked')
} finally {
  await browser?.close()
  if (child && child.exitCode===null) {
    child.kill('SIGTERM')
    await new Promise<void>(done=>child!.once('exit',()=>done()))
  }
  await rm(temp,{recursive:true,force:true})
}

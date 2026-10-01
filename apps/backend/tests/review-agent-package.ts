// Integration check requires `pnpm build:agent`; no service installation is run.
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'

const dir = await mkdtemp(join(tmpdir(), 'homenas-review-package-'))
process.env.HOMENAS_DATA_DIR = dir
const app = buildApp()
try {
  await app.ready()
  const session = (await app.inject({method:'POST',url:'/api/setup/autologin'})).json()
  const headers = {'x-session-id':session.sessionId,'x-csrf-token':session.csrfToken}
  const created = await app.inject({method:'POST',url:'/api/active-backup/devices',headers,payload:{name:'review-packages',hostname:'fixture',os_type:'linux'}})
  assert.equal(created.statusCode,201)
  for (const [platform,arch] of [['windows','amd64'],['linux','amd64'],['linux','arm64'],['mac','amd64'],['mac','arm64']]) {
    const response = await app.inject({url:`/api/active-backup/devices/${created.json().id}/agent-package?platform=${platform}&arch=${arch}`,headers})
    assert.equal(response.statusCode,200,`${platform}/${arch}: ${response.body.slice(0,150)}`)
    assert.equal(response.headers['content-type'],'application/zip')
    assert.equal(response.rawPayload.subarray(0,4).toString('hex'),'504b0304')
    assert.ok(response.rawPayload.length > 64*1024, 'real binary archive must exceed stream high-watermark')
    assert.ok(response.rawPayload.subarray(-512).includes(Buffer.from('homenas-agent.json')), 'ZIP central directory must contain config')
    console.log(`PASS ${platform}/${arch}: full ZIP ${response.rawPayload.length} bytes`)
  }
} finally { await app.close(); await rm(dir,{recursive:true,force:true}); delete process.env.HOMENAS_DATA_DIR }

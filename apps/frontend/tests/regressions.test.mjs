import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'

// PLAYWRIGHT_MODULE allows using an existing isolated tooling installation.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = fileURLToPath(new URL('../', import.meta.url))
let server, browser, origin
before(async () => {
  server = await createServer({ root, configFile: `${root}vite.config.ts`, server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  origin = server.resolvedUrls.local[0]
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) })
})
after(async () => { await browser?.close(); await server?.close() })

const auth = (sessionId = 'session-a') => ({ sessionId, csrfToken: 'csrf-test', user: { id: 1, username: 'admin', role: 'admin' } })
async function pageFor(t, handlers = {}) {
  const context = await browser.newContext()
  t.after(() => context.close())
  const page = await context.newPage()
  page.setDefaultTimeout(10_000)
  page.on('pageerror', err => console.error('Browser error:', err.message))
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (!pathname.startsWith('/api/')) return route.continue()
    const path = pathname.slice(4)
    const handler = handlers[path]
    if (handler) return handler(route)
    return route.fulfill({ status: 503, json: { message: 'Service unavailable in isolated test' } })
  })
  await page.goto(`${origin}login`)
  await page.locator('input[autocomplete="username"]').waitFor()
  return page
}
const json = value => route => route.fulfill({ json: value })

// Uses the actual API client, Zustand store and React components served by Vite.
test('TOTP challenge survives HTTP 401 and login submits the second factor', async t => {
  const payloads = []
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/auth/login': async route => {
      const payload = route.request().postDataJSON()
      payloads.push(payload)
      return payload.totpCode
        ? route.fulfill({ json: auth() })
        : route.fulfill({ status: 401, json: { requireTotp: true, message: 'Segundo factor requerido' } })
    },
  })
  if (process.env.FRONTEND_SCREENSHOTS) await page.screenshot({ path: `${process.env.FRONTEND_SCREENSHOTS}/screenshot-login.png`, fullPage: true })
  await page.locator('input[autocomplete="username"]').fill('admin')
  await page.locator('input[autocomplete="current-password"]').fill('Secret123')
  await page.locator('button[type="submit"]').click()
  await page.locator('input[autocomplete="one-time-code"]').fill('123456')
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(origin)
  assert.deepEqual(payloads, [{ username: 'admin', password: 'Secret123' }, { username: 'admin', password: 'Secret123', totpCode: '123456' }])
})

test('invalid login reports backend message without a spurious TOTP prompt', async t => {
  const page = await pageFor(t, { '/auth/login': route => route.fulfill({ status: 401, json: { message: 'Invalid credentials' } }) })
  await page.locator('input[autocomplete="username"]').fill('admin')
  await page.locator('input[autocomplete="current-password"]').fill('WrongPassword')
  await page.locator('button[type="submit"]').click()
  await page.getByText('Invalid credentials', { exact: true }).waitFor()
  assert.equal(await page.locator('input[autocomplete="one-time-code"]').count(), 0)
})

test('changing sessions clears private cache; old 401 cannot invalidate new login', async t => {
  const page = await pageFor(t, { '/auth/me': route => route.fulfill({ status: 401, json: { message: 'Session expired' } }) })
  const result = await page.evaluate(async input => {
    const { useAuthStore } = await import('/src/stores/authStore.ts')
    const { queryClient } = await import('/src/lib/queryClient.ts')
    const { invalidateSession, apiFetch } = await import('/src/api/client.ts')
    useAuthStore.getState().login(input)
    queryClient.setQueryData(['private'], ['old-user-data'])
    useAuthStore.getState().login({ ...input, sessionId: 'session-b' })
    const cleared = queryClient.getQueryData(['private']) === undefined
    invalidateSession('session-a')
    const survivesOldFailure = useAuthStore.getState().sessionId === 'session-b'
    let error
    try { await apiFetch('/auth/me') } catch (err) { error = { status: err.status, message: err.message } }
    return { cleared, survivesOldFailure, loggedOut: !useAuthStore.getState().isAuthenticated, error }
  }, auth())
  assert.deepEqual(result, { cleared: true, survivesOldFailure: true, loggedOut: true, error: { status: 401, message: 'Session expired' } })
})

test('API accepts native Headers and sends session and CSRF headers', async t => {
  let headers
  const page = await pageFor(t, { '/echo': route => { headers = route.request().headers(); return route.fulfill({ json: { ok: true } }) } })
  await page.evaluate(async input => {
    const { useAuthStore } = await import('/src/stores/authStore.ts')
    const { apiFetch } = await import('/src/api/client.ts')
    useAuthStore.getState().login(input)
    await apiFetch('/echo', { method: 'POST', body: '{}', headers: new Headers({ 'X-Test': 'native-headers' }) })
  }, auth())
  assert.equal(headers['x-test'], 'native-headers')
  assert.equal(headers['x-session-id'], 'session-a')
  assert.equal(headers['x-csrf-token'], 'csrf-test')
  assert.equal(headers['content-type'], 'application/json')
})

async function setupPage(t, extra = {}) {
  const page = await pageFor(t, {
    '/setup/status': json({ complete: false }),
    '/setup/autologin': json(auth()),
    '/setup/account': json({ ok: true, username: 'adminnew' }),
    '/setup/network': json({ interfaces: [{ name: 'eth0', ip: '192.0.2.10', isDhcp: false }] }),
    '/storage/disks': json([]),
    ...extra,
  })
  await page.goto(`${origin}setup`)
  await page.getByRole('button', { name: 'Empezar', exact: true }).waitFor()
  if (process.env.FRONTEND_SCREENSHOTS) await page.screenshot({ path: `${process.env.FRONTEND_SCREENSHOTS}/screenshot-setup.png`, fullPage: true })
  await page.getByRole('button', { name: 'Empezar', exact: true }).click()
  await page.locator('input[autocomplete="username"]').fill('adminnew')
  await page.locator('input[autocomplete="new-password"]').nth(0).fill('Secret123')
  await page.locator('input[autocomplete="new-password"]').nth(1).fill('Secret123')
  await page.getByRole('button', { name: 'Crear cuenta y continuar', exact: true }).click()
  await page.getByText('Configuración de red', { exact: true }).waitFor()
  return page
}

test('editing existing static IP saves payload and advances storage step', async t => {
  let payload
  const page = await setupPage(t, {
    '/setup/network': route => {
      if (route.request().method() === 'GET') return json({ interfaces: [{ name: 'eth0', ip: '192.0.2.10', isDhcp: false }] })(route)
      payload = route.request().postDataJSON()
      return route.fulfill({ json: { ok: true } })
    },
  })
  await page.locator('input[placeholder="192.168.1.10"]').fill('192.0.2.20')
  await page.getByRole('button', { name: 'Guardar y continuar', exact: true }).click()
  await page.getByRole('heading', { name: 'Almacenamiento', exact: true }).waitFor()
  assert.deepEqual(payload, { interface: 'eth0', mode: 'static', ip: '192.0.2.20', prefix: 24, gateway: '192.0.2.1', dns: '8.8.8.8' })
})

test('failed setup completion remains on wizard and displays error; retry succeeds', async t => {
  let complete = false, attempts = 0
  const page = await setupPage(t, {
    '/setup/status': route => json({ complete })(route),
    '/setup/complete': route => {
      attempts++
      if (attempts === 1) return route.fulfill({ status: 500, json: { message: 'Persistence failed' } })
      complete = true
      return route.fulfill({ json: { ok: true } })
    },
  })
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('button', { name: 'Configurar después', exact: true }).click()
  await page.getByRole('button', { name: 'Ir al dashboard', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Persistence failed' }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/setup')
  assert.equal(complete, false)
  await page.getByRole('button', { name: 'Ir al dashboard', exact: true }).click()
  await page.waitForURL(origin)
  assert.equal(complete, true)
})

test('upload invalid JSON rejects instead of leaving its promise pending', async t => {
  const page = await pageFor(t, { '/files/upload': route => route.fulfill({ status: 200, body: '<html>proxy</html>' }) })
  const error = await page.evaluate(async () => {
    const { filesApi } = await import('/src/api/files.ts')
    try { await filesApi.upload('/tmp', [new File(['test'], 'test.txt')]); return null }
    catch (err) { return err.message }
  })
  assert.equal(error, 'Invalid upload response')
})

test('cron previews contain future runs only and omit unsupported expressions', async t => {
  const page = await pageFor(t)
  const previews = await page.evaluate(async () => {
    const { getNextRunsPreview } = await import('/src/lib/cronPreview.ts')
    const now = new Date(2026, 9, 1, 15, 40, 20)
    return {
      hourly: getNextRunsPreview('10 * * * *', now),
      daily: getNextRunsPreview('10 9 * * *', now),
      unsupported: getNextRunsPreview('*/5 * * * *', now),
      weekly: getNextRunsPreview('10 9 * * 1', now),
      invalid: getNextRunsPreview('80 25 * * *', now),
      expectedHourly: [16, 17, 18].map(hour => new Date(2026, 9, 1, hour, 10).toLocaleString()),
      expectedDaily: [2, 3, 4].map(day => new Date(2026, 9, day, 9, 10).toLocaleString()),
    }
  })
  assert.deepEqual(previews.hourly, previews.expectedHourly)
  assert.deepEqual(previews.daily, previews.expectedDaily)
  assert.deepEqual(previews.unsupported, [])
  assert.deepEqual(previews.weekly, [])
  assert.deepEqual(previews.invalid, [])
})

test('disk browsing sends selected partition, not just parent disk', async t => {
  let payload
  const page = await pageFor(t, {
    '/storage/disks/sdz/mount': route => { payload = route.request().postDataJSON(); return route.fulfill({ json: { mountPoint: '/mnt/browse/test' } }) },
  })
  await page.evaluate(async () => {
    const { storageApi } = await import('/src/api/storage.ts')
    await storageApi.mountPartition('sdz', { browserId: 'browse_test', partition: '/dev/sdz2' })
  })
  assert.deepEqual(payload, { browserId: 'browse_test', partition: '/dev/sdz2' })
})

test('compose completion refreshes stack status and rejected action displays error', async t => {
  let stackRequests = 0, finished = false, running = false, reject = false
  const stack = { name: 'test-stack', path: '/opt/stacks/test', status: 'stopped', runningCount: 0, containerCount: 1, services: ['test'] }
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/docker/containers': json([]),
    '/docker/stacks': route => { stackRequests++; return json([{ ...stack, status: finished ? 'running' : 'stopped', runningCount: finished ? 1 : 0 }])(route) },
    '/docker/stacks/progress': route => {
      const result = { running, action: 'up', output: [], error: null }
      if (running) { running = false; finished = true }
      return json(result)(route)
    },
    '/docker/stacks/action': route => {
      if (reject) return route.fulfill({ status: 409, json: { message: 'Compose operation already running' } })
      running = true
      return json({ started: true })(route)
    },
  })
  await page.evaluate(async input => { const { useAuthStore } = await import('/src/stores/authStore.ts'); useAuthStore.getState().login(input) }, auth())
  await page.goto(`${origin}docker`)
  await page.getByRole('button', { name: 'Up', exact: true }).click()
  await page.getByText('running', { exact: true }).waitFor()
  assert.ok(stackRequests >= 3)
  reject = true
  await page.getByRole('button', { name: 'Pull', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Compose operation already running' }).waitFor()
})

test('changing selected disks resets destructive setup confirmation', async t => {
  const disks = ['sdz', 'sdy'].map(name => ({ name, device: `/dev/${name}`, diskType: 'hdd', mountPoint: null, sizeBytes: 1000000, model: 'Virtual test disk', smart: null }))
  const page = await setupPage(t, { '/storage/disks': json(disks) })
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  const selects = page.locator('select')
  await selects.nth(0).selectOption('data')
  await page.getByRole('checkbox').check()
  assert.equal(await page.getByRole('button', { name: 'Configurar almacenamiento', exact: true }).isEnabled(), true)
  await selects.nth(1).selectOption('data')
  assert.equal(await page.getByRole('checkbox').isChecked(), false)
  assert.equal(await page.getByRole('button', { name: 'Configurar almacenamiento', exact: true }).isEnabled(), false)
  await page.getByRole('button').filter({ hasText: 'Disco único' }).click()
  await page.getByRole('checkbox').check()
  assert.equal(await page.getByRole('button', { name: 'Configurar almacenamiento', exact: true }).isEnabled(), false)
})

test('setup API rejects malformed status instead of rendering as incomplete', async t => {
  const page = await pageFor(t, { '/setup/status': json(null) })
  const message = await page.evaluate(async () => {
    const { setupApi } = await import('/src/api/setup.ts')
    try { await setupApi.getStatus(); return null } catch (err) { return err.message }
  })
  assert.equal(message, 'Invalid setup status response')
})


test('setup does not offer formatting mounted or system disks', async t => {
  const disks = ['/', '/mnt/existing'].map((mountPoint, i) => ({ name: `test${i}`, device: `/dev/test${i}`, diskType: 'hdd', mountPoint, sizeBytes: 1000000, model: 'Protected virtual disk', smart: null }))
  const page = await setupPage(t, { '/storage/disks': json(disks) })
  await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByRole('heading', { name: 'Almacenamiento', exact: true }).waitFor()
  assert.equal(await page.locator('select').count(), 0)
  assert.equal(await page.getByRole('checkbox').count(), 0)
  assert.equal(await page.getByRole('button', { name: 'Configurar almacenamiento', exact: true }).count(), 0)
})

test('delayed 401 from downloads/list/upload cannot log out a newer session', async t => {
  const requests = []
  const unauthorized = route => {
    requests.push(route.request().headers()['x-session-id'])
    return route.fulfill({ status: 401, json: { message: 'Session expired' } })
  }
  const page = await pageFor(t, {
    '/files/download': unauthorized,
    '/files/list': unauthorized,
    '/files/upload': unauthorized,
    '/system/db-backup': unauthorized,
  })
  const result = await page.evaluate(async input => {
    const { useAuthStore } = await import('/src/stores/authStore.ts')
    const { filesApi } = await import('/src/api/files.ts')
    const { systemApi } = await import('/src/api/system.ts')
    const operations = [
      () => filesApi.getDownloadUrl('/tmp/test'),
      () => filesApi.list('/tmp'),
      () => filesApi.upload('/tmp', [new File(['test'], 'test.txt')]),
      () => systemApi.db.backup(),
    ]
    const outcomes = []
    const realFetch = window.fetch
    const realSend = XMLHttpRequest.prototype.send
    for (const operation of operations) {
      useAuthStore.getState().login(input)
      let signalStarted
      const started = new Promise(resolve => { signalStarted = resolve })
      window.fetch = function (...args) {
        const response = realFetch.apply(this, args)
        signalStarted()
        return response
      }
      XMLHttpRequest.prototype.send = function (...args) {
        const result = realSend.apply(this, args)
        signalStarted()
        return result
      }
      const pending = operation().then(() => 'unexpected-success', err => err.message)
      // Wait for the actual network invocation, including dynamic imports in
      // legacy downloads, before changing the authenticated user.
      await started
      useAuthStore.getState().login({ ...input, sessionId: 'session-b' })
      const message = await pending
      outcomes.push({ message, session: useAuthStore.getState().sessionId })
    }
    window.fetch = realFetch
    XMLHttpRequest.prototype.send = realSend
    return outcomes
  }, auth())
  assert.deepEqual(result, Array.from({ length: 4 }, () => ({ message: 'UNAUTHORIZED', session: 'session-b' })))
  assert.deepEqual(requests, Array.from({ length: 4 }, () => 'session-a'))
})

test('401 from the current download session logs out consistently', async t => {
  const unauthorized = route => route.fulfill({ status: 401, json: { message: 'Session expired' } })
  const page = await pageFor(t, {
    '/files/download': unauthorized,
    '/files/list': unauthorized,
    '/files/upload': unauthorized,
    '/system/db-backup': unauthorized,
  })
  const result = await page.evaluate(async input => {
    const { useAuthStore } = await import('/src/stores/authStore.ts')
    const { filesApi } = await import('/src/api/files.ts')
    const { systemApi } = await import('/src/api/system.ts')
    const operations = [
      () => filesApi.getDownloadUrl('/tmp/test'),
      () => filesApi.list('/tmp'),
      () => filesApi.upload('/tmp', [new File(['test'], 'test.txt')]),
      () => systemApi.db.backup(),
    ]
    const outcomes = []
    for (const operation of operations) {
      useAuthStore.getState().login(input)
      const message = await operation().then(() => 'unexpected-success', err => err.message)
      outcomes.push({ message, loggedOut: !useAuthStore.getState().isAuthenticated })
    }
    return outcomes
  }, auth())
  assert.deepEqual(result, Array.from({ length: 4 }, () => ({ message: 'UNAUTHORIZED', loggedOut: true })))
})


test('retired features are absent from routes/menu while local/cloud backup remain', async t => {
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/backup/jobs': json([]),
    '/backup/progress': json({ running: false }),
  })
  await page.evaluate(async input => { const { useAuthStore } = await import('/src/stores/authStore.ts'); useAuthStore.getState().login(input) }, auth())
  await page.goto(`${origin}backup`)
  await page.locator('aside a[href="/backup"]').waitFor()
  assert.equal(await page.locator('aside a[href="/active-directory"]').count(), 0)
  assert.equal(await page.locator('aside a[href="/active-backup"]').count(), 0)
  assert.equal(await page.locator('aside a[href="/cloud-backup"]').count(), 1)
  assert.equal(await page.locator('aside a[href="/syncthing"]').count(), 0)
  assert.equal(await page.locator('aside a[href="/scheduler"]').count(), 0)
  const paths = await page.evaluate(async () => {
    const { router } = await import('/src/router.tsx')
    return router.routes.flatMap(route => [route.path, ...(route.children || []).map(child => child.path)])
  })
  assert.equal(paths.includes('active-directory'), false)
  assert.equal(paths.includes('active-backup'), false)
  assert.equal(paths.includes('backup'), true)
  assert.equal(paths.includes('cloud-backup'), true)
  assert.equal(paths.includes('syncthing'), true)
  assert.equal(paths.includes('scheduler'), true)
})

test('network rates render current RX/TX immediately and follow interface changes/removal', async t => {
  let interfaces = [
    { name: 'eth0', rxBytesPerSec: 1500000, txBytesPerSec: 2500000 },
    { name: 'eth1', rxBytesPerSec: 3000, txBytesPerSec: 4000 },
  ]
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/network/stats': route => json({ interfaces })(route),
  })
  await page.evaluate(async input => { const { useAuthStore } = await import('/src/stores/authStore.ts'); useAuthStore.getState().login(input) }, auth())
  await page.goto(`${origin}network`)
  await page.getByRole('heading', { name: 'Bandwidth', exact: true }).waitFor()
  const chart = page.locator('div').filter({ has: page.getByRole('heading', { name: 'Bandwidth', exact: true }) }).filter({ has: page.locator('canvas') }).last()
  await chart.getByText('1.5 MB/s', { exact: true }).waitFor()
  await chart.getByText('2.5 MB/s', { exact: true }).waitFor()
  interfaces[0] = { name: 'eth0', rxBytesPerSec: 5750000, txBytesPerSec: 850000 }
  await page.evaluate(async () => { const { queryClient } = await import('/src/lib/queryClient.ts'); await queryClient.invalidateQueries({ queryKey: ['network', 'stats'] }) })
  await chart.getByText('5.8 MB/s', { exact: true }).waitFor()
  await chart.getByText('850 KB/s', { exact: true }).waitFor()
  await page.getByLabel('Interfaz de ancho de banda').selectOption('eth1')
  await chart.getByText('3 KB/s', { exact: true }).waitFor()
  await chart.getByText('4 KB/s', { exact: true }).waitFor()
  interfaces = [{ name: 'eth0', rxBytesPerSec: 0.5, txBytesPerSec: 0 }]
  await page.evaluate(async () => { const { queryClient } = await import('/src/lib/queryClient.ts'); await queryClient.invalidateQueries({ queryKey: ['network', 'stats'] }) })
  await chart.getByText('0.5 B/s', { exact: true }).waitFor()
  await chart.getByText('0 B/s', { exact: true }).waitFor()
  await chart.getByText('eth0', { exact: true }).waitFor()
})

test('dashboard network rates display byte units and low-rate precision', async t => {
  const metrics = {
    cpu: { usagePercent: 0, tempCelsius: null, cores: 1 },
    memory: { totalBytes: 1000000, usedBytes: 0, freeBytes: 1000000, usagePercent: 0 },
    network: { interface: 'eth-test', rxBytesPerSec: 1500000, txBytesPerSec: 0.5, rxTotal: 0, txTotal: 0 },
    uptime: 0, loadAvg: [0, 0, 0], fans: [], temps: [], power: null,
  }
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/system/metrics': json(metrics),
  })
  await page.evaluate(async input => { const { useAuthStore } = await import('/src/stores/authStore.ts'); useAuthStore.getState().login(input) }, auth())
  await page.goto(origin)
  await page.getByText('eth-test', { exact: true }).waitFor()
  await page.getByText('1.5 MB/s', { exact: true }).waitFor()
  await page.getByText('0.5 B/s', { exact: true }).waitFor()
})

test('dashboard RX/TX histories record constant sample ticks and reset when interface changes', async t => {
  let iface = 'eth-first'
  const page = await pageFor(t, {
    '/setup/status': json({ complete: true }),
    '/system/metrics': route => json({
      cpu: { usagePercent: 0, tempCelsius: null, cores: 1 },
      memory: { totalBytes: 1000000, usedBytes: 0, freeBytes: 1000000, usagePercent: 0 },
      network: { interface: iface, rxBytesPerSec: 1000000, txBytesPerSec: 2000000, rxTotal: 0, txTotal: 0 },
      uptime: 0, loadAvg: [0, 0, 0], fans: [], temps: [], power: null,
    })(route),
  })
  await page.evaluate(async input => { const { useAuthStore } = await import('/src/stores/authStore.ts'); useAuthStore.getState().login(input) }, auth())
  await page.goto(origin)
  await page.getByText('eth-first', { exact: true }).waitFor()
  const refetch = () => page.evaluate(async () => { const { queryClient } = await import('/src/lib/queryClient.ts'); await queryClient.invalidateQueries({ queryKey: ['system', 'metrics'] }) })
  for (let i = 0; i < 2; i++) await refetch()
  const rx = page.locator('path[stroke="#10b981"]')
  const tx = page.locator('path[stroke="#3b82f6"]')
  await rx.waitFor({ state: 'attached' })
  await tx.waitFor({ state: 'attached' })
  assert.ok(((await rx.getAttribute('d')).match(/L/g) || []).length >= 2)
  assert.ok(((await tx.getAttribute('d')).match(/L/g) || []).length >= 2)
  iface = 'eth-second'
  await refetch()
  await page.getByText('eth-second', { exact: true }).waitFor()
  assert.equal(await rx.count(), 0)
  assert.equal(await tx.count(), 0)
  await refetch()
  await rx.waitFor({ state: 'attached' })
  await tx.waitFor({ state: 'attached' })
  assert.equal(((await rx.getAttribute('d')).match(/L/g) || []).length, 1)
  assert.equal(((await tx.getAttribute('d')).match(/L/g) || []).length, 1)
})

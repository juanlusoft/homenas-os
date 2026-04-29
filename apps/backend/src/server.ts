import { readFileSync } from 'node:fs'
import { buildApp } from './app.js'
import { createSchedulerService } from './services/scheduler.service.js'

// Optional HTTPS — read cert/key if paths are provided
const certPath = process.env.CERT_PATH
const keyPath  = process.env.KEY_PATH
const httpsOptions = (certPath && keyPath)
  ? { cert: readFileSync(certPath), key: readFileSync(keyPath) }
  : undefined

const app = buildApp(httpsOptions)

async function shutdown(signal: string) {
  app.log.info(`Received ${signal} — shutting down gracefully`)
  try {
    // Stop all scheduled cron jobs
    createSchedulerService(app.db).shutdown()
  } catch {
    // db may not be ready if shutdown happens before plugin registration
  }
  await app.close()
  process.exit(0)
}

process.on('SIGTERM', () => { void shutdown('SIGTERM') })
process.on('SIGINT',  () => { void shutdown('SIGINT') })

const port = parseInt(process.env.PORT ?? '3000', 10)

try {
  await app.listen({ port, host: '0.0.0.0' })
  app.log.info(`HomeNas OS v3 backend running on port ${port}${httpsOptions ? ' (HTTPS)' : ''}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}

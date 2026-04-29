import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

const ALGO = 'aes-256-gcm'
const ENC_PREFIX = 'enc:'

// Key derived from /etc/machine-id — unique per installation.
// If someone copies only the SQLite DB, the tokens are useless without the machine-id.
function getDerivedKey(): Buffer {
  let machineId = ''
  try {
    machineId = readFileSync('/etc/machine-id', 'utf-8').trim()
  } catch {
    // Dev environment fallback — not a production machine
    machineId = 'homenas-dev-fallback-id'
  }
  return createHash('sha256').update(`homenas-v3:${machineId}`).digest()
}

export function encryptSecret(plaintext: string): string {
  const key = getDerivedKey()
  const iv = randomBytes(12) // 96-bit IV for AES-GCM
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag() // 16 bytes
  // Layout: iv(12) + tag(16) + ciphertext
  const payload = Buffer.concat([iv, tag, encrypted])
  return `${ENC_PREFIX}${payload.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  // Transparent fallback: if value is not encrypted (legacy rows), return as-is
  if (!stored.startsWith(ENC_PREFIX)) return stored
  const key = getDerivedKey()
  const payload = Buffer.from(stored.slice(ENC_PREFIX.length), 'base64')
  const iv = payload.subarray(0, 12)
  const tag = payload.subarray(12, 28)
  const ciphertext = payload.subarray(28)
  const decipher = createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(ciphertext).toString('utf-8') + decipher.final('utf-8')
}

import { createReadStream, createWriteStream } from 'node:fs'
import { stat, mkdir, rm, copyFile, unlink, open } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { join, basename, extname } from 'node:path'
import type { FastifyInstance } from 'fastify'
import multipartPlugin, { type Multipart } from '@fastify/multipart'
import {
  listDirectory,
  createDirectory,
  deleteItem,
  renameItem,
  moveItem,
  copyItem,
  searchFiles,
  getFileInfo,
  getFileLocations,
  validateWritableRealPath,
  validateRealPath,
} from '../../services/files.service.js'
import { logError, logInfo } from '../../lib/log-store.js'

// Extensions that are executable/dangerous regardless of content.
// Includes web-renderable formats (html, svg, phtml…) that could be served
// as webshells or used for stored-XSS if the file ends up exposed via SMB/HTTP.
const BLOCKED_EXTENSIONS = new Set([
  // Unix scripts
  '.sh', '.bash', '.zsh', '.fish', '.py', '.py3', '.pyc', '.pyo', '.rb', '.pl', '.lua',
  // PHP / web shells
  '.php', '.php3', '.php4', '.php5', '.php7', '.phtml', '.phar', '.phps',
  // Java / JSP
  '.jsp', '.jspx', '.jar', '.war', '.class',
  // .NET / ASP
  '.asp', '.aspx', '.ashx', '.asmx', '.cgi',
  // Web-renderable (XSS / stored payloads)
  '.html', '.htm', '.xhtml', '.svg', '.svgz', '.mhtml', '.xht',
  // JavaScript / TypeScript
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  // Windows executables
  '.exe', '.dll', '.bat', '.cmd', '.com', '.scr', '.pif', '.msi', '.msp', '.mst',
  '.ps1', '.ps2', '.psc1', '.psc2', '.psm1', '.psd1',
  '.vbs', '.vbe', '.vba', '.wsf', '.wsh', '.hta', '.lnk', '.scf', '.gadget',
  // macOS / Linux binaries / packages
  '.app', '.dmg', '.deb', '.rpm', '.apk', '.elf', '.bin', '.run', '.so', '.dylib',
])

// Magic bytes for known dangerous file types that might be disguised under a
// different extension. Variable-length signatures supported.
const BLOCKED_MAGIC: Array<{ sig: number[]; label: string }> = [
  { sig: [0x7f, 0x45, 0x4c, 0x46], label: 'ELF executable' },             // ELF
  { sig: [0x4d, 0x5a],             label: 'Windows executable (PE)' },     // MZ
  { sig: [0x23, 0x21],             label: 'Script (shebang)' },            // #!
  { sig: [0xca, 0xfe, 0xba, 0xbe], label: 'Java class / Mach-O fat' },     // Java/Mach-O
  { sig: [0xfe, 0xed, 0xfa, 0xce], label: 'Mach-O 32-bit' },
  { sig: [0xfe, 0xed, 0xfa, 0xcf], label: 'Mach-O 64-bit' },
  { sig: [0xcf, 0xfa, 0xed, 0xfe], label: 'Mach-O 64-bit (LE)' },
  { sig: [0x4d, 0x53, 0x43, 0x46], label: 'Windows installer (MSI)' },     // MSCF
  { sig: [0x3c, 0x3f, 0x70, 0x68, 0x70], label: 'PHP source' },            // <?php
  { sig: [0x3c, 0x25, 0x40], label: 'JSP/ASP page' },                      // <%@
  { sig: [0x3c, 0x68, 0x74, 0x6d, 0x6c], label: 'HTML document' },         // <html
  { sig: [0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45], label: 'HTML doctype' }, // <!DOCTYPE
  { sig: [0x3c, 0x73, 0x76, 0x67], label: 'SVG (XML payload)' },           // <svg
]

const MAGIC_HEAD_BYTES = 16

async function checkFileSafety(filePath: string, filename: string): Promise<void> {
  const ext = extname(filename).toLowerCase()
  if (BLOCKED_EXTENSIONS.has(ext)) {
    throw new Error(`File type not allowed: ${ext}`)
  }
  // Read first MAGIC_HEAD_BYTES bytes to check magic signature regardless of extension
  const fh = await open(filePath, 'r')
  const buf = Buffer.alloc(MAGIC_HEAD_BYTES)
  try {
    await fh.read(buf, 0, MAGIC_HEAD_BYTES, 0)
  } finally {
    await fh.close()
  }
  // Lower-case ASCII letters in the head, so HTML detection isn't bypassed by
  // <HTML> / <Svg> casing tricks. Bytes that aren't letters stay untouched.
  const lower = Buffer.from(buf)
  for (let i = 0; i < lower.length; i++) {
    const b = lower[i]!
    if (b >= 0x41 && b <= 0x5a) lower[i] = b + 0x20
  }
  for (const { sig, label } of BLOCKED_MAGIC) {
    if (sig.length > lower.length) continue
    if (sig.every((byte, i) => lower[i] === byte)) {
      throw new Error(`Blocked file type detected: ${label}`)
    }
  }
}

export async function filesRoutes(fastify: FastifyInstance) {
  const { requireAuth } = fastify

  // Use @fastify/multipart for streaming uploads — avoids buffering entire files in memory.
  // 50 GB file size limit; no field size restriction beyond Node defaults.
  await fastify.register(multipartPlugin, {
    limits: { fileSize: 50 * 1024 * 1024 * 1024 },
  })

  // GET /api/files/locations — returns the list of user-facing storage locations
  fastify.get('/locations', {
    preHandler: [requireAuth],
  }, async (_request, reply) => {
    try {
      const locations = await getFileLocations()
      return reply.send(locations)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(500).send({ error: 'Error', message })
    }
  })

  // GET /api/files/list?path=
  fastify.get('/list', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { path } = request.query as { path?: string }
    if (!path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path query param required' })
    }
    try {
      const entries = await listDirectory(path)
      return reply.send(entries)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // POST /api/files/mkdir — body: { path }
  fastify.post('/mkdir', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as { path?: unknown }
    if (typeof body?.path !== 'string' || !body.path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path is required' })
    }
    try {
      await createDirectory(body.path)
      return reply.status(201).send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // DELETE /api/files/item — body: { path }
  fastify.delete('/item', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as { path?: unknown }
    if (typeof body?.path !== 'string' || !body.path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path is required' })
    }
    try {
      await deleteItem(body.path)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') || message.includes('Cannot delete') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // POST /api/files/rename — body: { oldPath, newPath }
  fastify.post('/rename', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as { oldPath?: unknown; newPath?: unknown }
    if (typeof body?.oldPath !== 'string' || typeof body?.newPath !== 'string') {
      return reply.status(400).send({ error: 'Bad Request', message: 'oldPath and newPath are required' })
    }
    try {
      await renameItem(body.oldPath, body.newPath)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // POST /api/files/move — body: { source, destination }
  fastify.post('/move', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as { source?: unknown; destination?: unknown }
    if (typeof body?.source !== 'string' || typeof body?.destination !== 'string') {
      return reply.status(400).send({ error: 'Bad Request', message: 'source and destination are required' })
    }
    try {
      await moveItem(body.source, body.destination)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // POST /api/files/copy — body: { source, destination }
  fastify.post('/copy', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const body = request.body as { source?: unknown; destination?: unknown }
    if (typeof body?.source !== 'string' || typeof body?.destination !== 'string') {
      return reply.status(400).send({ error: 'Bad Request', message: 'source and destination are required' })
    }
    try {
      await copyItem(body.source, body.destination)
      return reply.send({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') || message.includes('read-only') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // GET /api/files/download?path= — stream file
  fastify.get('/download', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { path } = request.query as { path?: string }
    if (!path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path query param required' })
    }

    let safePath: string
    try {
      safePath = await validateRealPath(path)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(403).send({ error: 'Forbidden', message })
    }

    let fileStat: Awaited<ReturnType<typeof stat>>
    try {
      fileStat = await stat(safePath)
    } catch {
      return reply.status(404).send({ error: 'Not Found', message: 'File not found' })
    }

    if (!fileStat.isFile()) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Path is not a file' })
    }

    const fileName = basename(safePath)
    const safeFileName = fileName.replace(/[\r\n"\\]/g, '_')
    // RFC 5987 filename* — preserves UTF-8 names (acentos, ñ, kanji…) in browsers
    // that support it. Plain `filename=` kept as ASCII fallback for legacy clients.
    const asciiFallback = safeFileName.replace(/[^\x20-\x7E]/g, '_')
    const utf8Encoded = encodeURIComponent(safeFileName)
    reply.header(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`,
    )
    reply.header('Content-Length', fileStat.size)
    reply.header('Content-Type', 'application/octet-stream')

    const stream = createReadStream(safePath)
    return reply.send(stream)
  })

  // POST /api/files/upload — multipart upload (streamed — no full-file buffering)
  // body: multipart/form-data with field "path" (destination directory) + one or more file parts
  fastify.post('/upload', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const tmpDir = `/tmp/homenas-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
    await mkdir(tmpDir, { recursive: true })

    const fields: Record<string, string> = {}
    const stagedFiles: { filename: string; savedPath: string }[] = []

    try {
      const parts = (request as unknown as { parts(): AsyncIterable<Multipart> }).parts()
      for await (const part of parts) {
        if (part.type === 'field') {
          fields[part.fieldname] = String(part.value)
        } else {
          const safeFilename = basename(part.filename).replace(/[^a-zA-Z0-9._\- ]/g, '_') || 'upload'
          const savedPath = join(tmpDir, safeFilename)
          await pipeline(part.file, createWriteStream(savedPath))
          await checkFileSafety(savedPath, safeFilename)
          stagedFiles.push({ filename: safeFilename, savedPath })
        }
      }
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true })
      const message = err instanceof Error ? err.message : 'Upload failed'
      logError('upload', 'multipart parsing failed', { message })
      return reply.status(400).send({ error: 'Bad Request', message })
    }

    const pathValue = fields['path']
    if (!pathValue) {
      await rm(tmpDir, { recursive: true, force: true })
      return reply.status(400).send({ error: 'Bad Request', message: '"path" field is required' })
    }

    let safeDest: string
    try {
      safeDest = await validateWritableRealPath(pathValue)
    } catch (err) {
      await rm(tmpDir, { recursive: true, force: true })
      const message = err instanceof Error ? err.message : 'Unknown error'
      return reply.status(403).send({ error: 'Forbidden', message })
    }

    await mkdir(safeDest, { recursive: true })

    const savedFiles: string[] = []
    for (const file of stagedFiles) {
      const destPath = join(safeDest, file.filename)
      try {
        await validateWritableRealPath(destPath)
      } catch (err) {
        await rm(tmpDir, { recursive: true, force: true })
        const message = err instanceof Error ? err.message : 'Unknown error'
        return reply.status(403).send({ error: 'Forbidden', message })
      }
      // copyFile + unlink handles cross-filesystem moves (EXDEV from PrivateTmp → /mnt).
      // homenas has write access to /mnt/storage via sambashare group membership.
      try {
        await copyFile(file.savedPath, destPath)
        await unlink(file.savedPath)
      } catch (copyErr) {
        await rm(tmpDir, { recursive: true, force: true })
        const message = copyErr instanceof Error ? copyErr.message : 'Failed to copy uploaded file'
        logError('upload', 'copy to destination failed', { src: file.savedPath, dest: destPath, error: message })
        throw new Error(message)
      }
      logInfo('upload', 'file uploaded', { dest: destPath })
      savedFiles.push(destPath)
    }

    await rm(tmpDir, { recursive: true, force: true })
    return reply.status(201).send({ ok: true, files: savedFiles })
  })

  // GET /api/files/search?path=&q=
  fastify.get('/search', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { path, q } = request.query as { path?: string; q?: string }
    if (!path || !q) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path and q query params required' })
    }
    try {
      const results = await searchFiles(path, q)
      return reply.send(results)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })

  // GET /api/files/info?path=
  fastify.get('/info', {
    preHandler: [requireAuth],
  }, async (request, reply) => {
    const { path } = request.query as { path?: string }
    if (!path) {
      return reply.status(400).send({ error: 'Bad Request', message: 'path query param required' })
    }
    try {
      const info = await getFileInfo(path)
      return reply.send(info)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      const status = message.includes('traversal') || message.includes('must start') ? 403 : 500
      return reply.status(status).send({ error: 'Error', message })
    }
  })
}

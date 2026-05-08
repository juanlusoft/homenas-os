import { execa } from 'execa'

// When the service runs as a non-root user (homenas), all privileged commands
// are automatically routed through sudo. The sudoers file grants homenas
// NOPASSWD access to required system commands.
const AS_ROOT = process.getuid?.() === 0

export async function exec(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!command || command.trim() === '') {
    throw new Error('Command cannot be empty')
  }

  const cmd     = AS_ROOT ? command : 'sudo'
  const cmdArgs = AS_ROOT ? args    : [command, ...args]

  try {
    const result = await execa(cmd, cmdArgs, {
      shell: false,
      reject: false,
      maxBuffer: 4 * 1024 * 1024,
    })

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'stdout' in err && 'stderr' in err && 'exitCode' in err) {
      const execaErr = err as { stdout?: string; stderr?: string; exitCode?: number }
      return {
        stdout: execaErr.stdout ?? '',
        stderr: execaErr.stderr ?? '',
        exitCode: execaErr.exitCode ?? 1,
      }
    }
    throw err
  }
}

// For commands that need stdin input (e.g. smbpasswd -s).
export async function execWithInput(
  command: string,
  args: string[],
  input: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (!command || command.trim() === '') {
    throw new Error('Command cannot be empty')
  }

  const cmd     = AS_ROOT ? command : 'sudo'
  const cmdArgs = AS_ROOT ? args    : [command, ...args]

  try {
    const result = await execa(cmd, cmdArgs, {
      shell: false,
      reject: false,
      input,
      maxBuffer: 4 * 1024 * 1024,
    })

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
      exitCode: result.exitCode ?? 0,
    }
  } catch (err) {
    if (err && typeof err === 'object' && 'stdout' in err && 'stderr' in err && 'exitCode' in err) {
      const execaErr = err as { stdout?: string; stderr?: string; exitCode?: number }
      return {
        stdout: execaErr.stdout ?? '',
        stderr: execaErr.stderr ?? '',
        exitCode: execaErr.exitCode ?? 1,
      }
    }
    throw err
  }
}

// Returns [command, args] with sudo prepended when not running as root.
// Use this for direct execa() calls that need custom options (e.g. spawn).
export function sudoWrap(command: string, args: string[]): [string, string[]] {
  return AS_ROOT ? [command, args] : ['sudo', [command, ...args]]
}

// Atomically write content to a system file owned by root. Uses `install`
// (coreutils) via the sudo helper: writes content to a private temp file
// owned by the current user, then `install -m <mode> -o root -g root tmp dst`
// performs the privileged copy in one atomic step. Cleans up tmp afterwards.
//
// Required because the service runs as the `homenas` user, which can READ
// /etc/samba/smb.conf, /etc/exports, /etc/wireguard/* but not WRITE them
// directly. EACCES is what you would otherwise see.
export async function writeFileAsRoot(
  target: string,
  content: string,
  mode: number = 0o644,
): Promise<void> {
  // Use async fs APIs to avoid blocking the Fastify event loop while writing
  // potentially large config blobs (smb.conf, exports, etc.).
  const { writeFile, mkdtemp, unlink, rmdir } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const path       = await import('node:path')

  const dir = await mkdtemp(path.join(tmpdir(), 'homenas-write-'))
  const tmp = path.join(dir, 'payload')
  await writeFile(tmp, content, { mode: 0o600 })
  try {
    const modeStr = mode.toString(8).padStart(4, '0')
    const r = await exec('install', ['-m', modeStr, '-o', 'root', '-g', 'root', tmp, target])
    if (r.exitCode !== 0) {
      throw new Error(`writeFileAsRoot ${target} failed: ${r.stderr || r.stdout || `exit ${r.exitCode}`}`)
    }
  } finally {
    try { await unlink(tmp) } catch {}
    try { await rmdir(dir) } catch {}
  }
}

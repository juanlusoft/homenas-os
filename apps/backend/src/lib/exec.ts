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

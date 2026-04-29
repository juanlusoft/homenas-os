import os from 'os'
import { readFile } from 'fs/promises'
import type { SystemMetrics } from '@homenas/shared'

// ─── Module-level state for rate calculations ─────────────────────────────────

interface ProcStatSnapshot {
  timestamp: number
  idle: number
  total: number
}

interface CoreSnapshot {
  idle: number
  total: number
}

interface NetSnapshot {
  timestamp: number
  rxBytes: number
  txBytes: number
  interface: string
}

let prevProcStat: ProcStatSnapshot | null = null
let prevCoreSnapshots: CoreSnapshot[] | null = null
let prevNetSnapshot: NetSnapshot | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

// Parse /proc/stat first CPU line: cpu  user nice system idle iowait irq softirq steal guest guest_nice
function parseProcStat(content: string): { idle: number; total: number } | null {
  const line = content.split('\n').find(l => l.startsWith('cpu '))
  if (!line) return null
  const parts = line.trim().split(/\s+/).slice(1).map(Number)
  const idle = parts[3] + (parts[4] ?? 0) // idle + iowait
  const total = parts.reduce((sum, v) => sum + v, 0)
  return { idle, total }
}

// Parse /proc/net/dev for a given interface
function parseNetDev(content: string, iface: string): { rxBytes: number; txBytes: number } | null {
  const lines = content.split('\n')
  const line = lines.find(l => l.trim().startsWith(iface + ':'))
  if (!line) return null
  const cols = line.trim().split(/\s+/)
  // Format: iface: rx_bytes rx_packets rx_errs rx_drop rx_fifo rx_frame rx_compressed rx_multicast tx_bytes ...
  const rxBytes = parseInt(cols[1], 10)
  const txBytes = parseInt(cols[9], 10)
  if (isNaN(rxBytes) || isNaN(txBytes)) return null
  return { rxBytes, txBytes }
}

// Detect usable network interface: prefer eth1, fallback to first non-lo
function detectInterface(content: string): string {
  const lines = content.split('\n').slice(2) // skip header lines
  const interfaces = lines
    .map(l => l.trim().split(':')[0]?.trim())
    .filter((name): name is string => !!name && name !== 'lo')
  if (interfaces.includes('eth1')) return 'eth1'
  return interfaces[0] ?? 'eth0'
}

// ─── CPU metrics ──────────────────────────────────────────────────────────────

async function getCpuUsage(): Promise<number> {
  const content1 = await readFileSafe('/proc/stat')
  if (!content1) {
    // Fallback: use os.loadavg()[0] as a rough proxy on macOS
    return Math.min(os.loadavg()[0] * 10, 100)
  }

  const snap1 = parseProcStat(content1)
  if (!snap1) return 0

  const now = Date.now()

  if (prevProcStat) {
    const dTotal = snap1.total - prevProcStat.total
    const dIdle = snap1.idle - prevProcStat.idle
    prevProcStat = { timestamp: now, ...snap1 }
    if (dTotal === 0) return 0
    return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100))
  }

  // First call: take a 200ms snapshot
  await new Promise(resolve => setTimeout(resolve, 200))
  const content2 = await readFileSafe('/proc/stat')
  if (!content2) {
    prevProcStat = { timestamp: now, ...snap1 }
    return 0
  }
  const snap2 = parseProcStat(content2)
  if (!snap2) {
    prevProcStat = { timestamp: now, ...snap1 }
    return 0
  }

  prevProcStat = { timestamp: Date.now(), ...snap2 }
  const dTotal = snap2.total - snap1.total
  const dIdle = snap2.idle - snap1.idle
  if (dTotal === 0) return 0
  return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100))
}

async function getCpuTemp(): Promise<number | null> {
  const raw = await readFileSafe('/sys/class/thermal/thermal_zone0/temp')
  if (!raw) return null
  const millidegrees = parseInt(raw.trim(), 10)
  if (isNaN(millidegrees)) return null
  return millidegrees / 1000
}

// ─── CPU info (model, physical cores, speed) ─────────────────────────────────

interface CpuInfo {
  model: string | null
  physicalCores: number | null
  speedGhz: number | null
}

async function getCpuInfo(): Promise<CpuInfo> {
  try {
    const content = await readFileSafe('/proc/cpuinfo')
    if (!content) return { model: null, physicalCores: null, speedGhz: null }

    let model: string | null = null
    let physicalCores: number | null = null
    let speedGhz: number | null = null

    // Model name
    const modelMatch = content.match(/^[Mm]odel name\s*:\s*(.+)$/m)
      ?? content.match(/^[Hh]ardware\s*:\s*(.+)$/m)
      ?? content.match(/^[Mm]odel\s*:\s*(.+)$/m)
    if (modelMatch) model = modelMatch[1].trim()

    // ARM: "CPU part" — map to friendly names
    if (!model || model === 'ARMv8 Processor rev 3 (v8l)') {
      const partMatch = content.match(/^CPU part\s*:\s*(.+)$/m)
      const implMatch = content.match(/^CPU implementer\s*:\s*(.+)$/m)
      if (partMatch) {
        const part = partMatch[1].trim().toLowerCase()
        const impl = implMatch?.[1].trim().toLowerCase() ?? ''
        if (impl === '0x41') { // ARM
          const partMap: Record<string, string> = {
            '0xd03': 'Cortex-A53', '0xd07': 'Cortex-A57', '0xd08': 'Cortex-A72',
            '0xd09': 'Cortex-A73', '0xd0b': 'Cortex-A76', '0xd0d': 'Cortex-A77',
            '0xd41': 'Cortex-A78', '0xd44': 'Cortex-X1',  '0xd46': 'Cortex-A510',
            '0xd47': 'Cortex-A710', '0xd4b': 'Cortex-A78C', '0xd4d': 'Cortex-A715',
          }
          model = partMap[part] ?? `ARM ${part}`
        }
      }
    }

    // Physical cores: count unique "core id" entries, fallback to processor count
    const coreIds = new Set(Array.from(content.matchAll(/^core id\s*:\s*(\d+)/gm), m => m[1]))
    if (coreIds.size > 0) {
      physicalCores = coreIds.size
    } else {
      const processorCount = Array.from(content.matchAll(/^processor\s*:/gm)).length
      if (processorCount > 0) physicalCores = processorCount
    }

    // Speed in GHz
    const mhzMatch = content.match(/^cpu MHz\s*:\s*([\d.]+)/m)
      ?? content.match(/^BogoMIPS\s*:\s*([\d.]+)/m)
    if (mhzMatch) {
      const mhz = parseFloat(mhzMatch[1])
      if (!isNaN(mhz) && mhz > 0) speedGhz = Math.round(mhz / 100) / 10
    }

    return { model, physicalCores, speedGhz }
  } catch {
    return { model: null, physicalCores: null, speedGhz: null }
  }
}

// ─── Per-core CPU loads ───────────────────────────────────────────────────────

function parseCoreStats(content: string): CoreSnapshot[] {
  const cores: CoreSnapshot[] = []
  for (const line of content.split('\n')) {
    if (!line.match(/^cpu\d+\s/)) continue
    const parts = line.trim().split(/\s+/).slice(1).map(Number)
    const idle = parts[3] + (parts[4] ?? 0)
    const total = parts.reduce((sum, v) => sum + v, 0)
    cores.push({ idle, total })
  }
  return cores
}

async function getCoreLoads(): Promise<number[]> {
  try {
    const content = await readFileSafe('/proc/stat')
    if (!content) return []
    const current = parseCoreStats(content)
    if (current.length === 0) return []

    let loads: number[]
    if (prevCoreSnapshots && prevCoreSnapshots.length === current.length) {
      loads = current.map((snap, i) => {
        const prev = prevCoreSnapshots![i]
        const dTotal = snap.total - prev.total
        const dIdle  = snap.idle  - prev.idle
        if (dTotal === 0) return 0
        return Math.round(Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100)))
      })
    } else {
      loads = current.map(() => 0)
    }
    prevCoreSnapshots = current
    return loads
  } catch {
    return []
  }
}

// ─── Swap metrics ─────────────────────────────────────────────────────────────

async function getSwap(): Promise<{ swapTotalBytes: number | null; swapUsedBytes: number | null }> {
  try {
    const content = await readFileSafe('/proc/meminfo')
    if (!content) return { swapTotalBytes: null, swapUsedBytes: null }
    const totalMatch = content.match(/^SwapTotal:\s+(\d+)\s+kB/m)
    const freeMatch  = content.match(/^SwapFree:\s+(\d+)\s+kB/m)
    if (!totalMatch || !freeMatch) return { swapTotalBytes: null, swapUsedBytes: null }
    const swapTotal = parseInt(totalMatch[1], 10) * 1024
    const swapFree  = parseInt(freeMatch[1], 10) * 1024
    if (swapTotal === 0) return { swapTotalBytes: null, swapUsedBytes: null }
    return { swapTotalBytes: swapTotal, swapUsedBytes: swapTotal - swapFree }
  } catch {
    return { swapTotalBytes: null, swapUsedBytes: null }
  }
}

// ─── Network metrics ──────────────────────────────────────────────────────────

async function getNetworkMetrics(): Promise<SystemMetrics['network']> {
  const content = await readFileSafe('/proc/net/dev')
  if (!content) {
    return {
      interface: 'N/A',
      rxBytesPerSec: 0,
      txBytesPerSec: 0,
      rxTotal: 0,
      txTotal: 0,
    }
  }

  const iface = detectInterface(content)
  const parsed = parseNetDev(content, iface)
  const now = Date.now()

  if (!parsed) {
    return {
      interface: iface,
      rxBytesPerSec: 0,
      txBytesPerSec: 0,
      rxTotal: 0,
      txTotal: 0,
    }
  }

  let rxBytesPerSec = 0
  let txBytesPerSec = 0

  if (prevNetSnapshot && prevNetSnapshot.interface === iface) {
    const elapsed = (now - prevNetSnapshot.timestamp) / 1000
    if (elapsed > 0) {
      rxBytesPerSec = Math.max(0, (parsed.rxBytes - prevNetSnapshot.rxBytes) / elapsed)
      txBytesPerSec = Math.max(0, (parsed.txBytes - prevNetSnapshot.txBytes) / elapsed)
    }
  }

  prevNetSnapshot = { timestamp: now, rxBytes: parsed.rxBytes, txBytes: parsed.txBytes, interface: iface }

  return {
    interface: iface,
    rxBytesPerSec,
    txBytesPerSec,
    rxTotal: parsed.rxBytes,
    txTotal: parsed.txBytes,
  }
}

// ─── Fan metrics (hwmon — any chip, EMC2305, nct*, etc.) ─────────────────────

async function getFanMetrics(): Promise<SystemMetrics['fans']> {
  try {
    const { readdir } = await import('fs/promises')

    // ── 1. Try /sys/class/hwmon/hwmon*/fan*_input ─────────────────────────────
    let hwmonDirs: string[]
    try {
      hwmonDirs = await readdir('/sys/class/hwmon')
    } catch {
      hwmonDirs = []
    }

    const fans: SystemMetrics['fans'] = []

    for (const hwmon of hwmonDirs) {
      // hwmon entries may be symlinks; resolve the real path via the device dir
      const hwmonPath = `/sys/class/hwmon/${hwmon}`

      const chipNameRaw = await readFileSafe(`${hwmonPath}/name`)
      const chipName = chipNameRaw?.trim() ?? hwmon

      let fanId = 1
      while (true) {
        const rpmRaw = await readFileSafe(`${hwmonPath}/fan${fanId}_input`)
        if (rpmRaw === null) break
        const rpm = parseInt(rpmRaw.trim(), 10)
        if (isNaN(rpm) || rpm === 0) { fanId++; continue }

        const targetRaw = await readFileSafe(`${hwmonPath}/pwm${fanId}`)
        const targetPercent = targetRaw
          ? Math.round((parseInt(targetRaw.trim(), 10) / 255) * 100)
          : null

        fans.push({ id: fans.length + 1, name: `${chipName} Fan ${fanId}`, rpm, targetPercent })
        fanId++
      }
    }

    if (fans.length > 0) return fans

    // ── 2. Fallback: /sys/class/thermal/thermal_zone*/temp (no RPM, skip fans) ─
    //    Some SBCs expose only temperature here; we return [] since we need RPM.

    // ── 3. Fallback: vcgencmd (Raspberry Pi) ─────────────────────────────────
    try {
      const { exec: execLib } = await import('../lib/exec.js')
      const vcg = await execLib('vcgencmd', ['measure_temp'])
      if (vcg.exitCode === 0) {
        // vcgencmd outputs: temp=47.2'C — we can't get RPM this way, return []
        // but at least don't error out
      }
    } catch {
      // vcgencmd not available, ignore
    }

    return fans
  } catch {
    return []
  }
}

// ─── Temperature metrics (hwmon temp*_input) ─────────────────────────────────

// Human-readable chip name overrides for common RPi / SBC sensors
const CHIP_LABELS: Record<string, string> = {
  cpu_thermal:  'CPU',
  rp1_adc:      'RP1',
  ina238:       'PSU',
  coretemp:     'CPU',
  acpitz:       'ACPI',
  nct6775:      'Motherboard',
  k10temp:      'CPU',
  it8:          'IT8',
}

async function getTempMetrics(): Promise<NonNullable<SystemMetrics['temps']>> {
  try {
    const { readdir } = await import('fs/promises')
    let hwmonDirs: string[]
    try {
      hwmonDirs = await readdir('/sys/class/hwmon')
    } catch {
      return []
    }

    const temps: NonNullable<SystemMetrics['temps']> = []

    for (const hwmon of hwmonDirs) {
      const hwmonPath = `/sys/class/hwmon/${hwmon}`
      const nameRaw = await readFileSafe(`${hwmonPath}/name`)
      const chipName = nameRaw?.trim() ?? hwmon

      let tempId = 1
      while (true) {
        const raw = await readFileSafe(`${hwmonPath}/temp${tempId}_input`)
        if (raw === null) break
        const millidegrees = parseInt(raw.trim(), 10)
        if (!isNaN(millidegrees)) {
          const celsius = Math.round(millidegrees / 100) / 10
          // Try to read label file (temp1_label etc.)
          const labelRaw = await readFileSafe(`${hwmonPath}/temp${tempId}_label`)
          const label = labelRaw?.trim() || null
          const chipLabel = CHIP_LABELS[chipName] ?? chipName
          const name = label ? `${chipLabel} — ${label}` : tempId === 1 ? chipLabel : `${chipLabel} ${tempId}`
          temps.push({ name, celsius })
        }
        tempId++
      }
    }

    return temps
  } catch {
    return []
  }
}

// ─── Power metrics (INA238) ───────────────────────────────────────────────────

async function getPowerMetrics(): Promise<SystemMetrics['power']> {
  try {
    const { readdir } = await import('fs/promises')
    let hwmonDirs: string[]
    try {
      hwmonDirs = await readdir('/sys/class/hwmon')
    } catch {
      return null
    }

    for (const hwmon of hwmonDirs) {
      const hwmonPath = `/sys/class/hwmon/${hwmon}`
      const nameRaw = await readFileSafe(`${hwmonPath}/name`)
      if (!nameRaw?.trim().toLowerCase().includes('ina')) continue

      // INA238: in1_input = voltage (mV), curr1_input = current (mA), power1_input = power (µW)
      const voltRaw = await readFileSafe(`${hwmonPath}/in1_input`)
      const currRaw = await readFileSafe(`${hwmonPath}/curr1_input`)
      const powerRaw = await readFileSafe(`${hwmonPath}/power1_input`)

      const volts = voltRaw ? parseInt(voltRaw.trim(), 10) / 1000 : null
      const amps = currRaw ? parseInt(currRaw.trim(), 10) / 1000 : null
      const watts = powerRaw ? parseInt(powerRaw.trim(), 10) / 1_000_000 : null

      if (volts !== null || amps !== null || watts !== null) {
        return {
          watts: watts ?? (volts !== null && amps !== null ? volts * amps : null),
          volts,
          amps,
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function getSystemMetrics(): Promise<SystemMetrics> {
  const [cpuUsage, cpuTemp, cpuInfo, coreLoads, networkMetrics, fans, power, temps, swap] = await Promise.all([
    getCpuUsage(),
    getCpuTemp(),
    getCpuInfo(),
    getCoreLoads(),
    getNetworkMetrics(),
    getFanMetrics(),
    getPowerMetrics(),
    getTempMetrics(),
    getSwap(),
  ])

  const totalBytes = os.totalmem()
  const freeBytes = os.freemem()
  const usedBytes = totalBytes - freeBytes
  const [l1, l5, l15] = os.loadavg()

  return {
    cpu: {
      usagePercent: Math.round(cpuUsage * 10) / 10,
      tempCelsius: cpuTemp !== null ? Math.round(cpuTemp * 10) / 10 : null,
      cores: os.cpus().length,
      model: cpuInfo.model,
      physicalCores: cpuInfo.physicalCores,
      speedGhz: cpuInfo.speedGhz,
      coreLoads,
    },
    memory: {
      totalBytes,
      usedBytes,
      freeBytes,
      usagePercent: Math.round((usedBytes / totalBytes) * 1000) / 10,
      ...swap,
    },
    network: networkMetrics,
    uptime: Math.floor(os.uptime()),
    loadAvg: [l1, l5, l15],
    fans,
    temps,
    power,
  }
}

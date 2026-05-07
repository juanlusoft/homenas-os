import { useState, useEffect } from 'react'
import {
  Cpu,
  MemoryStick,
  Network,
  Clock,
  Wind,
  Zap,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Thermometer,
  Fan,
  HardDrive,
  Container,
  Globe,
  Layers,
} from 'lucide-react'
import { useSystemMetrics } from '../../hooks/useSystem'
import { usePublicIp, useDdnsStatus, useNetworkInterfaces } from '../../hooks/useNetwork'
import { useDisks, useMergerFSStatus } from '../../hooks/useStorage'
import { useContainers } from '../../hooks/useDocker'
import { formatBytes, formatUptime } from '../../lib/utils'
import type { SystemMetrics } from '@homenas/shared'
import { useT } from '../../i18n/useT'

// ─── Sparkline (SVG, no deps) ─────────────────────────────────────────────────

const HISTORY = 40

function Sparkline({
  points,
  color = '#6366f1',
  fillColor,
  height = 36,
}: {
  points: number[]
  color?: string
  fillColor?: string
  height?: number
}) {
  if (points.length < 2) return null
  const w = 300
  const h = height
  const pad = 2
  const max = Math.max(...points, 1)
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2))
  const ys = points.map((v) => h - pad - ((v / max) * (h - pad * 2)))
  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ')
  const fillPath = `${linePath} L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} preserveAspectRatio="none">
      {fillColor && <path d={fillPath} fill={fillColor} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

function useHistory<T>(value: T | undefined, maxLen = HISTORY): T[] {
  const [buf, setBuf] = useState<T[]>([])
  useEffect(() => {
    if (value === undefined) return
    setBuf((prev) => [...prev.slice(-(maxLen - 1)), value])
  }, [value, maxLen])
  return buf
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-black/10 dark:bg-white/10 rounded ${className}`} />
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3 ${className}`}>
      {children}
    </div>
  )
}

function CardTitle({ icon, title, right }: { icon: React.ReactNode; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-indigo-500 dark:text-indigo-400">{icon}</span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
      </div>
      {right}
    </div>
  )
}

function Divider() {
  return <div className="border-t border-black/10 dark:border-white/10" />
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-xs text-gray-500 dark:text-white/40 shrink-0">{label}</span>
      <span className="text-xs font-mono text-gray-700 dark:text-white/80 text-right truncate max-w-[60%]">{children}</span>
    </div>
  )
}

function BigValue({ value, unit, color = 'indigo' }: { value: string; unit?: string; color?: 'indigo' | 'emerald' | 'amber' | 'orange' }) {
  const colors = { indigo: 'text-indigo-600 dark:text-indigo-400', emerald: 'text-emerald-600 dark:text-emerald-400', amber: 'text-amber-600 dark:text-amber-400', orange: 'text-orange-600 dark:text-orange-400' }
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-mono text-2xl font-semibold ${colors[color]}`}>{value}</span>
      {unit && <span className="text-xs text-gray-500 dark:text-white/40">{unit}</span>}
    </div>
  )
}

function MiniBar({ percent, color = 'indigo' }: { percent: number; color?: 'indigo' | 'emerald' | 'amber' | 'red' }) {
  const colors = { indigo: 'bg-indigo-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' }
  return (
    <div className="flex-1 h-1 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
      <div className={`${colors[color]} h-1 rounded-full`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
    </div>
  )
}

// ─── CPU card ─────────────────────────────────────────────────────────────────

function CpuCard({ data }: { data: SystemMetrics }) {
  const t = useT()
  const [l1, l5, l15] = data.loadAvg
  const pct = data.cpu.usagePercent
  const hot = pct > 80
  const strokeColor = hot ? '#f59e0b' : '#6366f1'
  const fillColor   = hot ? '#f59e0b18' : '#6366f118'
  const bigColor    = hot ? 'amber' : 'indigo'
  const history = useHistory(pct)
  const coreLoads = data.cpu.coreLoads ?? []

  return (
    <Card>
      <CardTitle
        icon={<Cpu className="w-4 h-4" />}
        title={t.dashboard.cpu}
        right={
          <div className="flex items-center gap-1.5">
            {data.cpu.model && (
              <span className="text-xs text-gray-500 dark:text-white/40 truncate max-w-[120px]">{data.cpu.model}</span>
            )}
            {data.cpu.speedGhz && (
              <span className="text-xs font-mono bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40 px-1.5 py-0.5 rounded">{data.cpu.speedGhz} GHz</span>
            )}
          </div>
        }
      />
      <div>
        <div className="flex items-baseline justify-between">
          <BigValue value={`${pct.toFixed(1)}%`} unit="uso" color={bigColor} />
          <span className="text-xs text-gray-500 dark:text-white/40">
            {data.cpu.physicalCores ?? data.cpu.cores} núcleos · {data.cpu.cores} hilos
          </span>
        </div>
        <div className="mt-2 -mx-1">
          <Sparkline points={history} color={strokeColor} fillColor={fillColor} />
        </div>
      </div>

      {coreLoads.length > 0 && (
        <>
          <Divider />
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {coreLoads.map((load, i) => {
              const cColor = load > 80 ? 'red' : load > 50 ? 'amber' : 'indigo'
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-500 dark:text-white/40 w-5 shrink-0">C{i}</span>
                  <MiniBar percent={load} color={cColor} />
                  <span className="text-xs font-mono text-gray-600 dark:text-white/60 w-8 text-right">{load}%</span>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Divider />
      <div className="space-y-1.5">
        <Row label={t.dashboard.temperature}>
          {data.cpu.tempCelsius !== null ? `${data.cpu.tempCelsius}°C` : '—'}
        </Row>
        <Row label={t.dashboard.loadAvg}>
          {l1.toFixed(2)} · {l5.toFixed(2)} · {l15.toFixed(2)}
        </Row>
      </div>
    </Card>
  )
}

// ─── Memory card ──────────────────────────────────────────────────────────────

function MemoryCard({ data }: { data: SystemMetrics }) {
  const t = useT()
  const { usedBytes, totalBytes, freeBytes, usagePercent, swapTotalBytes, swapUsedBytes } = data.memory
  const hot = usagePercent > 85
  const strokeColor = hot ? '#f59e0b' : '#6366f1'
  const fillColor   = hot ? '#f59e0b18' : '#6366f118'
  const bigColor    = hot ? 'amber' : 'indigo'
  const history = useHistory(usagePercent)
  const hasSwap = swapTotalBytes != null && swapTotalBytes > 0

  return (
    <Card>
      <CardTitle
        icon={<MemoryStick className="w-4 h-4" />}
        title={t.dashboard.memory}
        right={<span className="text-xs font-mono text-gray-500 dark:text-white/40">{formatBytes(totalBytes)}</span>}
      />
      <div>
        <BigValue value={`${usagePercent.toFixed(1)}%`} unit="usado" color={bigColor} />
        <div className="mt-2 -mx-1">
          <Sparkline points={history} color={strokeColor} fillColor={fillColor} />
        </div>
      </div>
      <Divider />
      <div className="space-y-1.5">
        <Row label={t.dashboard.used}>{formatBytes(usedBytes)}</Row>
        <Row label={t.dashboard.free}>{formatBytes(freeBytes)}</Row>
        {hasSwap && (
          <Row label="Swap">
            {formatBytes(swapUsedBytes ?? 0)} / {formatBytes(swapTotalBytes!)}
          </Row>
        )}
      </div>
    </Card>
  )
}

// ─── Network card ─────────────────────────────────────────────────────────────

function NetworkCard({ data }: { data: SystemMetrics }) {
  const { network } = data
  const { data: publicIpData } = usePublicIp()
  const { data: ddnsData } = useDdnsStatus()
  const { data: interfaces } = useNetworkInterfaces()

  const rxHistory = useHistory(network.rxBytesPerSec)
  const txHistory = useHistory(network.txBytesPerSec)

  const lanIp = interfaces?.find(i => i.isUp && i.ipv4)?.ipv4 ?? null
  const ddnsActive = ddnsData?.enabled ? 1 : 0

  return (
    <Card>
      <CardTitle
        icon={<Network className="w-4 h-4" />}
        title="Red"
        right={
          <span className="text-xs font-mono bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
            {network.interface}
          </span>
        }
      />

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <ArrowDown className="w-3 h-3" /><span className="text-xs">RX/s</span>
          </div>
          <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">{formatBytes(network.rxBytesPerSec)}/s</span>
        </div>
        <div className="-mx-1"><Sparkline points={rxHistory} color="#10b981" fillColor="#10b98118" height={24} /></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
            <ArrowUp className="w-3 h-3" /><span className="text-xs">TX/s</span>
          </div>
          <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{formatBytes(network.txBytesPerSec)}/s</span>
        </div>
        <div className="-mx-1"><Sparkline points={txHistory} color="#3b82f6" fillColor="#3b82f618" height={24} /></div>
      </div>

      <Divider />
      <div className="space-y-1.5">
        {lanIp && <Row label="IP local">{lanIp}</Row>}
        {publicIpData?.ip && <Row label="IP pública">{publicIpData.ip}</Row>}
        <Row label="RX total">{formatBytes(network.rxTotal)}</Row>
        <Row label="TX total">{formatBytes(network.txTotal)}</Row>
        {ddnsActive > 0 && <Row label="DDNS">{ddnsActive} servicio{ddnsActive !== 1 ? 's' : ''} activo{ddnsActive !== 1 ? 's' : ''}</Row>}
      </div>
    </Card>
  )
}

// ─── Uptime card ──────────────────────────────────────────────────────────────

function UptimeCard({ data }: { data: SystemMetrics }) {
  const t = useT()
  const hostname = typeof window !== 'undefined' ? window.location.hostname : 'homenas'
  return (
    <Card>
      <CardTitle icon={<Clock className="w-4 h-4" />} title={t.dashboard.uptime} />
      <BigValue value={formatUptime(data.uptime)} color="indigo" />
      <Divider />
      <Row label={t.dashboard.hostname}>{hostname}</Row>
    </Card>
  )
}

// ─── Fans + Temp card ─────────────────────────────────────────────────────────

function FansCard({ data }: { data: SystemMetrics }) {
  const t = useT()
  const fans = data.fans
  const temps = data.temps ?? []
  return (
    <Card>
      <CardTitle icon={<Wind className="w-4 h-4" />} title={t.dashboard.fansTemp} />
      {fans.length > 0 && (
        <>
          <div className="space-y-1.5">
            {fans.map((fan, idx) => {
              const label = fan.name ?? `Fan ${fan.id ?? idx + 1}`
              const key = fan.name ?? fan.id ?? idx
              return (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Fan className="w-3 h-3 text-indigo-500 dark:text-indigo-400" />
                    <span className="text-xs text-gray-600 dark:text-white/60">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400">{fan.rpm} RPM</span>
                    {fan.targetPercent != null && (
                      <span className="text-xs font-mono bg-black/5 dark:bg-white/5 text-gray-500 dark:text-white/40 px-1.5 py-0.5 rounded">{fan.targetPercent}%</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          {temps.length > 0 && <Divider />}
        </>
      )}
      {temps.length > 0 && (
        <div className="space-y-1.5">
          {temps.map((temp) => {
            const c = temp.celsius >= 70 ? 'text-red-500 dark:text-red-400' : temp.celsius >= 50 ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
            return (
              <div key={temp.name} className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Thermometer className="w-3 h-3 text-orange-500 dark:text-orange-400" />
                  <span className="text-xs text-gray-600 dark:text-white/60">{temp.name}</span>
                </div>
                <span className={`text-xs font-mono font-semibold ${c}`}>{temp.celsius}°C</span>
              </div>
            )
          })}
        </div>
      )}
      {fans.length === 0 && temps.length === 0 && (
        <p className="text-xs text-gray-500 dark:text-white/30 italic">Sin datos</p>
      )}
    </Card>
  )
}

// ─── Power card ───────────────────────────────────────────────────────────────

function PowerCard({ data }: { data: SystemMetrics }) {
  const t = useT()
  if (data.power === null) {
    return (
      <Card>
        <CardTitle icon={<Zap className="w-4 h-4" />} title={t.dashboard.power} />
        <p className="text-xs text-gray-500 dark:text-white/30 italic">Sin datos de consumo</p>
      </Card>
    )
  }
  const { watts, volts, amps } = data.power
  return (
    <Card>
      <CardTitle icon={<Zap className="w-4 h-4" />} title={t.dashboard.power} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: t.dashboard.watts, value: watts !== null ? `${watts.toFixed(1)}W` : '—', accent: true },
          { label: t.dashboard.volts, value: volts !== null ? `${volts.toFixed(2)}V` : '—', accent: false },
          { label: t.dashboard.amps,  value: amps  !== null ? `${amps.toFixed(2)}A`  : '—', accent: false },
        ].map(({ label, value, accent }) => (
          <div key={label} className="bg-black/5 dark:bg-white/5 rounded-lg p-3 flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-white/40">{label}</span>
            <span className={`font-mono text-base font-semibold ${accent ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-800 dark:text-white/80'}`}>{value}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Discos section ───────────────────────────────────────────────────────────

interface DiskEntry {
  device: string
  name: string
  model: string | null
  sizeBytes: number
  usedBytes: number | null
  mountPoint: string | null
  smart: { healthy: boolean; temperature: number | null; powerOnHours: number | null } | null
}

function DisksSection() {
  const { data: disks, isLoading } = useDisks()

  if (isLoading) return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="w-4 h-4 rounded-full" />
        <Skeleton className="w-32 h-4" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
      </div>
    </div>
  )

  if (!disks || disks.length === 0) return null

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-indigo-500 dark:text-indigo-400"><HardDrive className="w-4 h-4" /></span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Discos conectados</span>
        <span className="text-xs text-gray-500 dark:text-white/40 ml-auto">{disks.length} disco{disks.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {(disks as DiskEntry[]).map(disk => {
          const usePct = disk.usedBytes != null && disk.sizeBytes > 0
            ? Math.round((disk.usedBytes / disk.sizeBytes) * 100)
            : null
          const temp = disk.smart?.temperature ?? null
          const tempColor = temp == null ? '' : temp > 50 ? 'text-red-500' : temp > 40 ? 'text-amber-500' : 'text-emerald-500'
          const healthy = disk.smart?.healthy

          return (
            <div key={disk.device} className="bg-black/5 dark:bg-white/5 rounded-lg p-3 border border-black/10 dark:border-white/10">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-800 dark:text-white truncate">
                    {disk.model ?? disk.name ?? disk.device}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-white/40 font-mono">{disk.device}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {temp != null && (
                    <span className={`text-xs font-mono font-semibold ${tempColor}`}>{temp}°C</span>
                  )}
                  {healthy != null && (
                    <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  )}
                </div>
              </div>
              {usePct != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
                    <span>{formatBytes(disk.usedBytes!)} / {formatBytes(disk.sizeBytes)}</span>
                    <span>{usePct}%</span>
                  </div>
                  <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full">
                    <div
                      className={`h-1 rounded-full ${usePct > 90 ? 'bg-red-500' : usePct > 75 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                      style={{ width: `${usePct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Cache widget ─────────────────────────────────────────────────────────────

function CacheWidget() {
  const { data: mergerfs, isLoading } = useMergerFSStatus()

  if (isLoading || !mergerfs?.mounted) return null

  const cacheDrives = mergerfs.drives.filter(d => d.role === 'cache')
  if (cacheDrives.length === 0) return null

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-emerald-500 dark:text-emerald-400"><Layers className="w-4 h-4" /></span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Estado de la Caché</span>
        <span className="text-xs font-mono text-gray-500 dark:text-white/40 ml-auto">{mergerfs.mountPoint}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cacheDrives.map(drive => {
          const usePct = drive.usedBytes != null && drive.totalBytes != null && drive.totalBytes > 0
            ? Math.round((drive.usedBytes / drive.totalBytes) * 100) : null
          return (
            <div key={drive.path} className="bg-black/5 dark:bg-white/5 rounded-lg p-3 border border-emerald-500/20">
              <div className="text-xs font-mono text-gray-600 dark:text-white/60 mb-2 truncate">{drive.path}</div>
              {usePct != null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
                    <span>{formatBytes(drive.usedBytes!)} / {formatBytes(drive.totalBytes!)}</span>
                    <span className={usePct > 85 ? 'text-amber-500' : ''}>{usePct}%</span>
                  </div>
                  <div className="w-full h-1 bg-black/10 dark:bg-white/10 rounded-full">
                    <div className={`h-1 rounded-full ${usePct > 90 ? 'bg-red-500' : usePct > 75 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${usePct}%` }} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Docker widget ────────────────────────────────────────────────────────────

function DockerWidget() {
  const { data: containers, isLoading } = useContainers()

  if (isLoading) return null

  const running = containers?.filter(c => c.state === 'running') ?? []
  const stopped = containers?.filter(c => c.state !== 'running') ?? []

  if ((containers?.length ?? 0) === 0) return null

  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-blue-500 dark:text-blue-400"><Container className="w-4 h-4" /></span>
        <span className="text-sm font-semibold text-gray-900 dark:text-white">Docker</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{running.length} activos
          </span>
          {stopped.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-white/40">{stopped.length} parados</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {(containers ?? []).map(c => {
          const isRunning = c.state === 'running'
          return (
            <div key={c.id} className="bg-black/5 dark:bg-white/5 rounded-lg p-3 flex items-center gap-3">
              <span className={`w-2 h-2 rounded-full shrink-0 ${isRunning ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-white/20'}`} />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-800 dark:text-white truncate">{c.name}</div>
                <div className="text-xs text-gray-500 dark:text-white/40 truncate">{c.image}</div>
              </div>
              {isRunning && c.cpuPercent != null && (
                <div className="text-xs font-mono text-gray-500 dark:text-white/40 shrink-0">{c.cpuPercent.toFixed(1)}%</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Skeleton className="w-4 h-4 rounded-full" />
        <Skeleton className="w-20 h-4" />
      </div>
      <Skeleton className="w-28 h-7" />
      <Skeleton className="w-full h-1 rounded-full" />
      <div className="space-y-2 pt-1">
        <Skeleton className="w-full h-3" />
        <Skeleton className="w-4/5 h-3" />
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function DashboardView() {
  const t = useT()
  const { data, isLoading, isError, error } = useSystemMetrics()

  return (
    <div className="space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-white/40 mt-1">System overview — live metrics</p>
      </div>

      {isError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{t.dashboard.failedToLoad}: {(error as Error)?.message ?? 'Unknown error'}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading || !data ? (
          <>{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</>
        ) : (
          <>
            <CpuCard data={data} />
            <MemoryCard data={data} />
            <NetworkCard data={data} />
            <UptimeCard data={data} />
            <FansCard data={data} />
            <PowerCard data={data} />
          </>
        )}
      </div>

      <DisksSection />
      <CacheWidget />
      <DockerWidget />
    </div>
  )
}

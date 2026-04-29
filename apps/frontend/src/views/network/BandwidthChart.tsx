import { useEffect, useRef, useState } from 'react'
import { Activity } from 'lucide-react'
import { useNetworkBandwidthStats } from '../../hooks/useNetwork'

// ─── Constants ────────────────────────────────────────────────────────────────

const HISTORY_LEN = 60

function formatBps(bps: number): string {
  if (bps < 1024) return `${bps.toFixed(0)} B/s`
  if (bps < 1024 ** 2) return `${(bps / 1024).toFixed(1)} KB/s`
  if (bps < 1024 ** 3) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`
  return `${(bps / 1024 ** 3).toFixed(2)} GB/s`
}

// ─── History state keyed by interface name ────────────────────────────────────

type HistoryMap = Map<string, { rx: number[]; tx: number[] }>

// ─── Canvas chart renderer ────────────────────────────────────────────────────

function drawChart(
  canvas: HTMLCanvasElement,
  rxHistory: number[],
  txHistory: number[],
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const { width, height } = canvas
  ctx.clearRect(0, 0, width, height)

  // Background
  ctx.fillStyle = 'rgba(255,255,255,0.02)'
  ctx.fillRect(0, 0, width, height)

  if (rxHistory.length < 2 && txHistory.length < 2) return

  const allValues = [...rxHistory, ...txHistory]
  const maxVal = Math.max(...allValues, 1024) // at least 1KB/s scale

  function drawLine(data: number[], color: string) {
    if (!ctx || data.length < 2) return
    const pts = data.map((v, i) => ({
      x: (i / (HISTORY_LEN - 1)) * width,
      y: height - (v / maxVal) * (height - 8) - 4,
    }))

    // Fill area under line
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, height)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(pts[pts.length - 1]!.x, height)
    ctx.closePath()
    ctx.fillStyle = color.replace(')', ', 0.15)').replace('rgb', 'rgba')
    ctx.fill()

    // Draw line
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, pts[0]!.y)
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i]!.x, pts[i]!.y)
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }

  drawLine(rxHistory, 'rgb(34,197,94)')   // green for rx
  drawLine(txHistory, 'rgb(99,102,241)')  // indigo for tx

  // Grid lines (faint)
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = (i / 4) * height
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}

// ─── BandwidthChart ───────────────────────────────────────────────────────────

export function BandwidthChart() {
  const { data } = useNetworkBandwidthStats()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<HistoryMap>(new Map())
  const [selectedIface, setSelectedIface] = useState<string>('')

  // Build interface list — prefer first non-loopback
  const interfaces = data?.interfaces ?? []
  const activeIfaces = interfaces.filter((i) => i.name !== 'lo')

  // Auto-select first active interface once data arrives
  useEffect(() => {
    if (!selectedIface && activeIfaces.length > 0) {
      setSelectedIface(activeIfaces[0]!.name)
    }
  }, [activeIfaces, selectedIface])

  // Update history on each data tick
  useEffect(() => {
    if (!data) return
    for (const iface of data.interfaces) {
      let h = historyRef.current.get(iface.name)
      if (!h) {
        h = { rx: [], tx: [] }
        historyRef.current.set(iface.name, h)
      }
      h.rx.push(iface.rxBytesPerSec)
      h.tx.push(iface.txBytesPerSec)
      if (h.rx.length > HISTORY_LEN) h.rx.shift()
      if (h.tx.length > HISTORY_LEN) h.tx.shift()
    }

    // Redraw
    if (canvasRef.current && selectedIface) {
      const h = historyRef.current.get(selectedIface)
      if (h) {
        // Resize canvas to match display size
        const canvas = canvasRef.current
        const rect = canvas.getBoundingClientRect()
        if (canvas.width !== rect.width || canvas.height !== rect.height) {
          canvas.width = rect.width
          canvas.height = rect.height
        }
        drawChart(canvas, h.rx, h.tx)
      }
    }
  }, [data, selectedIface])

  const currentIface = interfaces.find((i) => i.name === selectedIface)
  const currentHistory = historyRef.current.get(selectedIface)
  const latestRx = currentHistory ? (currentHistory.rx[currentHistory.rx.length - 1] ?? 0) : 0
  const latestTx = currentHistory ? (currentHistory.tx[currentHistory.tx.length - 1] ?? 0) : 0

  return (
    <div className="bg-black/5 dark:bg-white/5 backdrop-blur border border-black/10 dark:border-white/10 rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-black/10 dark:border-white/10 flex items-center gap-3 flex-wrap">
        <Activity className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <h2 className="font-semibold text-gray-900 dark:text-white">Bandwidth</h2>

        {/* Interface selector */}
        {activeIfaces.length > 1 && (
          <select
            value={selectedIface}
            onChange={(e) => setSelectedIface(e.target.value)}
            className="ml-2 bg-black/10 dark:bg-white/10 text-white/80 text-xs rounded-lg border border-black/10 dark:border-white/10 px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          >
            {activeIfaces.map((i) => (
              <option key={i.name} value={i.name} className="bg-gray-900">
                {i.name}
              </option>
            ))}
          </select>
        )}
        {activeIfaces.length === 1 && (
          <span className="ml-1 text-xs text-gray-500 dark:text-white/40 font-mono">{selectedIface}</span>
        )}

        {/* Live stats */}
        <div className="ml-auto flex items-center gap-4 text-xs font-mono tabular-nums">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-gray-500 dark:text-white/50">RX</span>
            <span className="text-green-700 dark:text-green-400">{formatBps(latestRx)}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-indigo-400" />
            <span className="text-gray-500 dark:text-white/50">TX</span>
            <span className="text-indigo-600 dark:text-indigo-400">{formatBps(latestTx)}</span>
          </span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-3">
        {!currentIface && activeIfaces.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-gray-400 dark:text-white/30 text-sm">
            No network interfaces available
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            className="w-full"
            style={{ height: '120px', display: 'block' }}
          />
        )}
      </div>

      {/* Legend */}
      <div className="px-6 pb-3 flex items-center gap-4 text-xs text-gray-400 dark:text-white/30">
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-green-400 rounded" />
          Download (RX)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 h-0.5 bg-indigo-400 rounded" />
          Upload (TX)
        </span>
        <span className="ml-auto">last {HISTORY_LEN} samples · 1.5s interval</span>
      </div>
    </div>
  )
}

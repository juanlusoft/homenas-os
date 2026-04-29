import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { X, Copy, CheckCircle } from 'lucide-react'
import { useAddWireguardPeer } from '../../hooks/useNetwork'
import type { AddWireguardPeerInput } from '@homenas/shared'

interface AddPeerModalProps {
  onClose: () => void
}

export function AddPeerModal({ onClose }: AddPeerModalProps) {
  const [peerResult, setPeerResult] = useState<{ config: string; qrCode: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const addPeer = useAddWireguardPeer()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddWireguardPeerInput>({
    defaultValues: {
      name: '',
      allowedIPs: '10.0.0.2/32',
      presharedKey: false,
    },
  })

  const onSubmit = async (data: AddWireguardPeerInput) => {
    try {
      const result = await addPeer.mutateAsync(data)
      setPeerResult(result)
    } catch {
      // error shown in addPeer.error
    }
  }

  const handleCopy = async () => {
    if (!peerResult) return
    await navigator.clipboard.writeText(peerResult.config)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-gray-100 dark:bg-gray-900 border border-black/10 dark:border-white/10 rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10 dark:border-white/10">
          <h2 className="text-gray-900 dark:text-white font-semibold">Add WireGuard Peer</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/80 hover:bg-black/5 dark:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {!peerResult ? (
            /* Form */
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Peer Name</label>
                <input
                  {...register('name', { required: 'Name is required', minLength: 1, maxLength: 64 })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="e.g. laptop, phone"
                />
                {errors.name && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">Allowed IPs</label>
                <input
                  {...register('allowedIPs', { required: 'Allowed IPs is required' })}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono placeholder-white/30 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="10.0.0.2/32"
                />
                {errors.allowedIPs && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.allowedIPs.message}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="presharedKey"
                  {...register('presharedKey')}
                  className="w-4 h-4 rounded border-white/20 bg-black/5 dark:bg-white/5 accent-indigo-500"
                />
                <label htmlFor="presharedKey" className="text-sm text-gray-600 dark:text-white/60">
                  Generate preshared key (extra security)
                </label>
              </div>

              {addPeer.error && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
                  {addPeer.error.message}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 rounded-lg bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white hover:bg-black/10 dark:bg-white/10 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addPeer.isPending}
                  className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addPeer.isPending ? 'Generating...' : 'Generate Peer'}
                </button>
              </div>
            </form>
          ) : (
            /* Result */
            <div className="space-y-4">
              <p className="text-sm text-green-700 dark:text-green-400">Peer created successfully!</p>

              {/* Config file */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm text-gray-600 dark:text-white/60">Client Configuration</label>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:text-indigo-300 transition-colors"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                </div>
                <pre className="bg-black/40 border border-black/10 dark:border-white/10 rounded-lg p-3 text-xs text-white/80 font-mono overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {peerResult.config}
                </pre>
              </div>

              {/* QR Code */}
              {peerResult.qrCode && (
                <div>
                  <label className="block text-sm text-gray-600 dark:text-white/60 mb-1.5">QR Code</label>
                  <div className="flex justify-center bg-white rounded-lg p-3">
                    <img
                      src={`data:image/png;base64,${peerResult.qrCode}`}
                      alt="WireGuard peer QR code"
                      className="w-48 h-48"
                    />
                  </div>
                </div>
              )}

              <button
                onClick={onClose}
                className="w-full px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-gray-900 dark:text-white text-sm font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

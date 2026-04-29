import { apiFetch } from './client'
import type {
  NetworkInterface,
  WireguardStatus,
  AddWireguardPeerInput,
  WireguardInitInput,
  DdnsStatus,
  SambaShare,
  SambaSession,
  CreateSambaShareInput,
  UpdateSambaShareInput,
  NfsExport,
  CreateNfsExportInput,
  UpdateNfsExportInput,
  NfsStatus,
} from '@homenas/shared'

export interface IpConfigInfo {
  interfaces: { name: string; ip: string | null; isDhcp: boolean }[]
}

export interface IpConfigInput {
  interface: string
  mode: 'dhcp' | 'static'
  ip?: string
  prefix?: number
  gateway?: string
  dns?: string
}

export interface IfaceBandwidth {
  name: string
  rxBytesPerSec: number
  txBytesPerSec: number
}

export interface NetworkBandwidthStats {
  interfaces: IfaceBandwidth[]
}

export const networkApi = {
  // ─── Interfaces ─────────────────────────────────────────────────────────────

  listInterfaces: (): Promise<NetworkInterface[]> =>
    apiFetch('/network/interfaces'),

  // ─── WireGuard ──────────────────────────────────────────────────────────────

  getWireguardStatus: (): Promise<WireguardStatus> =>
    apiFetch('/network/wireguard/status'),

  installWireguard: (): Promise<{ output: string }> =>
    apiFetch('/network/wireguard/install', { method: 'POST' }),

  initWireguard: (body: WireguardInitInput): Promise<{ initialized: boolean }> =>
    apiFetch('/network/wireguard/init', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  startWireguard: (): Promise<{ started: boolean }> =>
    apiFetch('/network/wireguard/start', { method: 'POST' }),

  stopWireguard: (): Promise<{ stopped: boolean }> =>
    apiFetch('/network/wireguard/stop', { method: 'POST' }),

  restartWireguard: (): Promise<{ restarted: boolean }> =>
    apiFetch('/network/wireguard/restart', { method: 'POST' }),

  addWireguardPeer: (body: AddWireguardPeerInput): Promise<{ config: string; qrCode: string }> =>
    apiFetch('/network/wireguard/peers', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  removeWireguardPeer: (publicKey: string): Promise<{ removed: boolean }> =>
    apiFetch(`/network/wireguard/peers/${encodeURIComponent(publicKey)}`, {
      method: 'DELETE',
    }),

  getPeerConfig: (publicKey: string): Promise<{ config: string; qrCode: string }> =>
    apiFetch(`/network/wireguard/peers/${encodeURIComponent(publicKey)}/config`),

  // ─── Public IP ───────────────────────────────────────────────────────────────

  getPublicIp: (): Promise<{ ip: string | null }> =>
    apiFetch('/network/public-ip'),

  // ─── DDNS ────────────────────────────────────────────────────────────────────

  getDdnsStatus: (): Promise<DdnsStatus> =>
    apiFetch('/network/ddns/status'),

  // ─── Samba ───────────────────────────────────────────────────────────────────

  listSambaShares: (): Promise<SambaShare[]> =>
    apiFetch('/network/samba/shares'),

  createSambaShare: (body: CreateSambaShareInput): Promise<SambaShare> =>
    apiFetch('/network/samba/shares', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateSambaShare: (name: string, body: UpdateSambaShareInput): Promise<SambaShare> =>
    apiFetch(`/network/samba/shares/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteSambaShare: (name: string): Promise<{ deleted: boolean }> =>
    apiFetch(`/network/samba/shares/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  listSambaSessions: (): Promise<SambaSession[]> =>
    apiFetch('/network/samba/sessions'),

  // ─── NFS ─────────────────────────────────────────────────────────────────────

  listNfsExports: (): Promise<NfsExport[]> =>
    apiFetch('/network/nfs/exports'),

  getNfsStatus: (): Promise<NfsStatus> =>
    apiFetch('/network/nfs/status'),

  createNfsExport: (body: CreateNfsExportInput): Promise<NfsExport> =>
    apiFetch('/network/nfs/exports', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  updateNfsExport: (path: string, body: UpdateNfsExportInput): Promise<NfsExport> =>
    apiFetch(`/network/nfs/exports/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteNfsExport: (path: string): Promise<{ deleted: boolean }> =>
    apiFetch(`/network/nfs/exports/${encodeURIComponent(path)}`, {
      method: 'DELETE',
    }),

  // ─── Bandwidth stats ──────────────────────────────────────────────────────────

  getNetworkBandwidthStats: (): Promise<NetworkBandwidthStats> =>
    apiFetch('/network/stats'),

  // ─── IP Config ────────────────────────────────────────────────────────────────

  getIpConfig: (): Promise<IpConfigInfo> =>
    apiFetch('/network/ip-config'),

  setIpConfig: (body: IpConfigInput): Promise<{ ok: boolean }> =>
    apiFetch('/network/ip-config', { method: 'POST', body: JSON.stringify(body) }),
}

import { apiFetch, silentFetch } from './client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ADStatus {
  sambaInstalled: boolean
  domainProvisioned: boolean
  serviceActive: boolean
  domain: string | null
  realm: string | null
}

export interface ADInstallProgress {
  running: boolean
  output: string[]
  error: string | null
  completed: boolean
}

export interface ADUser {
  username: string
  displayName: string | null
  enabled: boolean
  email: string | null
}

export interface ADGroup {
  name: string
  members: string[]
}

export interface ADComputer {
  name: string
}

export interface ProvisionConfig {
  domain: string
  realm: string
  adminPassword: string
}

export interface CreateUserPayload {
  username: string
  password: string
  displayName: string
}

// ─── API client ───────────────────────────────────────────────────────────────

export const adApi = {
  // Status — uses silentFetch to avoid triggering logout on background polls
  getStatus: async (): Promise<ADStatus> => {
    const res = await silentFetch('/ad/status')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },

  // Install
  startInstall: () =>
    apiFetch<{ started: boolean }>('/ad/install', { method: 'POST' }),

  getInstallProgress: async (): Promise<ADInstallProgress> => {
    const res = await silentFetch('/ad/install/progress')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
  },

  // Provision
  provision: (config: ProvisionConfig) =>
    apiFetch<{ ok: boolean }>('/ad/provision', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  // Service control
  startService: () => apiFetch<{ ok: boolean }>('/ad/start', { method: 'POST' }),
  stopService: () => apiFetch<{ ok: boolean }>('/ad/stop', { method: 'POST' }),
  restartService: () => apiFetch<{ ok: boolean }>('/ad/restart', { method: 'POST' }),

  // Users
  listUsers: (): Promise<ADUser[]> => apiFetch('/ad/users'),

  createUser: (payload: CreateUserPayload) =>
    apiFetch<{ ok: boolean }>('/ad/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteUser: (username: string) =>
    apiFetch<{ ok: boolean }>(`/ad/users/${encodeURIComponent(username)}`, { method: 'DELETE' }),

  enableUser: (username: string) =>
    apiFetch<{ ok: boolean }>(`/ad/users/${encodeURIComponent(username)}/enable`, { method: 'POST' }),

  disableUser: (username: string) =>
    apiFetch<{ ok: boolean }>(`/ad/users/${encodeURIComponent(username)}/disable`, { method: 'POST' }),

  resetPassword: (username: string, newPassword: string) =>
    apiFetch<{ ok: boolean }>(`/ad/users/${encodeURIComponent(username)}/password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  // Groups
  listGroups: (): Promise<ADGroup[]> => apiFetch('/ad/groups'),

  createGroup: (name: string) =>
    apiFetch<{ ok: boolean }>('/ad/groups', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deleteGroup: (name: string) =>
    apiFetch<{ ok: boolean }>(`/ad/groups/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  addMember: (group: string, username: string) =>
    apiFetch<{ ok: boolean }>(`/ad/groups/${encodeURIComponent(group)}/members`, {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  removeMember: (group: string, username: string) =>
    apiFetch<{ ok: boolean }>(`/ad/groups/${encodeURIComponent(group)}/members/${encodeURIComponent(username)}`, {
      method: 'DELETE',
    }),

  // Computers
  listComputers: (): Promise<ADComputer[]> => apiFetch('/ad/computers'),
}

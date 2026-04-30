import { exec } from '../lib/exec.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CatalogApp,
  AppConfig,
  AppStatus,
  InstallPayload,
  EditPayload,
  EditResponse,
  EffectiveContainerConfig,
  PortMapping,
  VolumeMapping,
  EnvVar,
  ResourceLimits,
} from '@homenas/shared'

// ─── Constants ────────────────────────────────────────────────────────────────

const HOMESTORE_DIR = '/opt/homenas-v3/homestore'

// ─── App Catalog Definition ───────────────────────────────────────────────────

interface AppDefinition {
  id: string
  name: string
  description: string
  icon: string
  category: CatalogApp['category']
  dockerImage: string
  defaultPorts: PortMapping[]
  defaultVolumes: VolumeMapping[]
  defaultEnvVars: EnvVar[]
  webPortIndex?: number  // index into defaultPorts for the web UI
}

const APP_CATALOG: AppDefinition[] = [
  // ── Media ──────────────────────────────────────────────────────────────────
  {
    id: 'plex',
    name: 'Plex Media Server',
    description: 'Stream your personal media library anywhere — movies, TV, music.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/plex.png',
    category: 'Media',
    dockerImage: 'plexinc/pms-docker:latest',
    defaultPorts: [
      { hostPort: 32400, containerPort: 32400, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/plex/config', containerPath: '/config', label: 'Config' },
      { hostPath: '/opt/homestore/plex/transcode', containerPath: '/transcode', label: 'Transcode temp' },
      { hostPath: '/mnt/storage/media', containerPath: '/data', label: 'Media library' },
    ],
    defaultEnvVars: [
      { key: 'PLEX_CLAIM', value: '', label: 'Plex Claim Token (optional)', secret: false },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'jellyfin',
    name: 'Jellyfin',
    description: 'Free software media system — the volunteer-built alternative to Plex.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/jellyfin.png',
    category: 'Media',
    dockerImage: 'jellyfin/jellyfin:latest',
    defaultPorts: [
      { hostPort: 8096, containerPort: 8096, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/jellyfin/config', containerPath: '/config', label: 'Config' },
      { hostPath: '/opt/homestore/jellyfin/cache', containerPath: '/cache', label: 'Cache' },
      { hostPath: '/mnt/storage/media', containerPath: '/media', label: 'Media library' },
    ],
    defaultEnvVars: [
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'immich',
    name: 'Immich',
    description: 'High-performance self-hosted photo and video management solution.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/immich.png',
    category: 'Media',
    dockerImage: 'ghcr.io/immich-app/immich-server:release',
    defaultPorts: [
      { hostPort: 2283, containerPort: 3001, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/mnt/storage/photos', containerPath: '/usr/src/app/upload', label: 'Fotos' },
      { hostPath: '/opt/homestore/immich/config', containerPath: '/config', label: 'Config' },
    ],
    defaultEnvVars: [
      { key: 'DB_HOSTNAME', value: 'immich_postgres', label: 'PostgreSQL host' },
      { key: 'DB_USERNAME', value: 'postgres', label: 'DB user' },
      { key: 'DB_PASSWORD', value: 'postgres', label: 'DB password', secret: true },
      { key: 'DB_DATABASE_NAME', value: 'immich', label: 'DB name' },
      { key: 'REDIS_HOSTNAME', value: 'immich_redis', label: 'Redis host' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  // ── Download ───────────────────────────────────────────────────────────────
  {
    id: 'qbittorrent',
    name: 'qBittorrent',
    description: 'Open-source BitTorrent client with a clean web interface.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/qbittorrent.png',
    category: 'Download',
    dockerImage: 'lscr.io/linuxserver/qbittorrent:latest',
    defaultPorts: [
      { hostPort: 8080, containerPort: 8080, protocol: 'tcp', label: 'Web UI' },
      { hostPort: 6881, containerPort: 6881, protocol: 'tcp', label: 'Torrent TCP' },
      { hostPort: 6881, containerPort: 6881, protocol: 'udp', label: 'Torrent UDP' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/qbittorrent/config', containerPath: '/config', label: 'Config' },
      { hostPath: '/mnt/storage/downloads', containerPath: '/downloads', label: 'Downloads' },
    ],
    defaultEnvVars: [
      { key: 'PUID', value: '1000', label: 'User ID' },
      { key: 'PGID', value: '1000', label: 'Group ID' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
      { key: 'WEBUI_PORT', value: '8080', label: 'Web UI port' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'sonarr',
    name: 'Sonarr',
    description: 'Smart PVR for newsgroup and bittorrent users — automates TV show downloads.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/sonarr.png',
    category: 'Download',
    dockerImage: 'lscr.io/linuxserver/sonarr:latest',
    defaultPorts: [
      { hostPort: 8989, containerPort: 8989, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/sonarr/config', containerPath: '/config', label: 'Config' },
      { hostPath: '/mnt/storage/media/series', containerPath: '/tv', label: 'Series' },
      { hostPath: '/mnt/storage/downloads', containerPath: '/downloads', label: 'Downloads' },
    ],
    defaultEnvVars: [
      { key: 'PUID', value: '1000', label: 'User ID' },
      { key: 'PGID', value: '1000', label: 'Group ID' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'radarr',
    name: 'Radarr',
    description: 'Movie collection manager and automatic downloader.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/radarr.png',
    category: 'Download',
    dockerImage: 'lscr.io/linuxserver/radarr:latest',
    defaultPorts: [
      { hostPort: 7878, containerPort: 7878, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/radarr/config', containerPath: '/config', label: 'Config' },
      { hostPath: '/mnt/storage/media/peliculas', containerPath: '/movies', label: 'Películas' },
      { hostPath: '/mnt/storage/downloads', containerPath: '/downloads', label: 'Downloads' },
    ],
    defaultEnvVars: [
      { key: 'PUID', value: '1000', label: 'User ID' },
      { key: 'PGID', value: '1000', label: 'Group ID' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'prowlarr',
    name: 'Prowlarr',
    description: 'Indexer manager/proxy supporting integration with Sonarr, Radarr, and more.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/prowlarr.png',
    category: 'Download',
    dockerImage: 'lscr.io/linuxserver/prowlarr:latest',
    defaultPorts: [
      { hostPort: 9696, containerPort: 9696, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/prowlarr/config', containerPath: '/config', label: 'Config' },
    ],
    defaultEnvVars: [
      { key: 'PUID', value: '1000', label: 'User ID' },
      { key: 'PGID', value: '1000', label: 'Group ID' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'overseerr',
    name: 'Overseerr',
    description: 'Request management and media discovery tool for the Plex ecosystem.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/overseerr.png',
    category: 'Download',
    dockerImage: 'lscr.io/linuxserver/overseerr:latest',
    defaultPorts: [
      { hostPort: 5055, containerPort: 5055, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/overseerr/config', containerPath: '/config', label: 'Config' },
    ],
    defaultEnvVars: [
      { key: 'PUID', value: '1000', label: 'User ID' },
      { key: 'PGID', value: '1000', label: 'Group ID' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  // ── Storage ────────────────────────────────────────────────────────────────
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Self-hosted cloud storage and collaboration platform.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nextcloud.png',
    category: 'Storage',
    dockerImage: 'nextcloud:latest',
    defaultPorts: [
      { hostPort: 8081, containerPort: 80, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/nextcloud/config', containerPath: '/var/www/html', label: 'Config' },
      { hostPath: '/mnt/storage/nextcloud', containerPath: '/var/www/html/data', label: 'Datos de usuarios' },
    ],
    defaultEnvVars: [
      { key: 'NEXTCLOUD_ADMIN_USER', value: 'admin', label: 'Admin username' },
      { key: 'NEXTCLOUD_ADMIN_PASSWORD', value: 'changeme', label: 'Admin password', secret: true },
    ],
    webPortIndex: 0,
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Painless self-hosted Git service with a familiar GitHub-like interface.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/gitea.png',
    category: 'Development',
    dockerImage: 'gitea/gitea:latest',
    defaultPorts: [
      { hostPort: 3000, containerPort: 3000, protocol: 'tcp', label: 'Web UI' },
      { hostPort: 2222, containerPort: 22, protocol: 'tcp', label: 'SSH' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/gitea/data', containerPath: '/data', label: 'Data' },
    ],
    defaultEnvVars: [
      { key: 'GITEA__database__DB_TYPE', value: 'sqlite3', label: 'DB type' },
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  // ── Networking ─────────────────────────────────────────────────────────────
  {
    id: 'pihole',
    name: 'Pi-hole',
    description: 'Network-wide ad blocking via your own DNS server.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/pi-hole.png',
    category: 'Networking',
    dockerImage: 'pihole/pihole:latest',
    defaultPorts: [
      { hostPort: 8082, containerPort: 80, protocol: 'tcp', label: 'Web UI' },
      { hostPort: 53, containerPort: 53, protocol: 'tcp', label: 'DNS TCP' },
      { hostPort: 53, containerPort: 53, protocol: 'udp', label: 'DNS UDP' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/pihole/etc-pihole', containerPath: '/etc/pihole', label: 'Pi-hole config' },
      { hostPath: '/opt/homestore/pihole/etc-dnsmasq.d', containerPath: '/etc/dnsmasq.d', label: 'dnsmasq config' },
    ],
    defaultEnvVars: [
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
      { key: 'WEBPASSWORD', value: 'changeme', label: 'Admin password', secret: true },
    ],
    webPortIndex: 0,
  },
  {
    id: 'nginx-proxy-manager',
    name: 'Nginx Proxy Manager',
    description: 'Expose your services easily with free SSL certificates.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/nginx-proxy-manager.png',
    category: 'Networking',
    dockerImage: 'jc21/nginx-proxy-manager:latest',
    defaultPorts: [
      { hostPort: 81, containerPort: 81, protocol: 'tcp', label: 'Admin UI' },
      { hostPort: 80, containerPort: 80, protocol: 'tcp', label: 'HTTP' },
      { hostPort: 443, containerPort: 443, protocol: 'tcp', label: 'HTTPS' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/nginx-proxy-manager/data', containerPath: '/data', label: 'Data' },
      { hostPath: '/opt/homestore/nginx-proxy-manager/letsencrypt', containerPath: '/etc/letsencrypt', label: 'SSL certs' },
    ],
    defaultEnvVars: [],
    webPortIndex: 0,
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Unofficial Bitwarden-compatible server — lightweight password manager.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/vaultwarden.png',
    category: 'Security',
    dockerImage: 'vaultwarden/server:latest',
    defaultPorts: [
      { hostPort: 8083, containerPort: 80, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/vaultwarden/data', containerPath: '/data', label: 'Data' },
    ],
    defaultEnvVars: [
      { key: 'ADMIN_TOKEN', value: '', label: 'Admin token (leave empty to disable)', secret: true },
      { key: 'SIGNUPS_ALLOWED', value: 'true', label: 'Allow signups' },
    ],
    webPortIndex: 0,
  },
  // ── Monitoring ─────────────────────────────────────────────────────────────
  {
    id: 'portainer',
    name: 'Portainer',
    description: 'Universal container management GUI — manage Docker from a browser.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/portainer.png',
    category: 'Monitoring',
    dockerImage: 'portainer/portainer-ce:latest',
    defaultPorts: [
      { hostPort: 9000, containerPort: 9000, protocol: 'tcp', label: 'Web UI' },
      { hostPort: 9443, containerPort: 9443, protocol: 'tcp', label: 'HTTPS UI' },
    ],
    defaultVolumes: [
      { hostPath: '/var/run/docker.sock', containerPath: '/var/run/docker.sock', label: 'Docker socket' },
      { hostPath: '/opt/homestore/portainer/data', containerPath: '/data', label: 'Data' },
    ],
    defaultEnvVars: [],
    webPortIndex: 0,
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Beautiful dashboards for metrics, logs and traces from any data source.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/grafana.png',
    category: 'Monitoring',
    dockerImage: 'grafana/grafana:latest',
    defaultPorts: [
      { hostPort: 3001, containerPort: 3000, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/grafana/data', containerPath: '/var/lib/grafana', label: 'Data' },
    ],
    defaultEnvVars: [
      { key: 'GF_SECURITY_ADMIN_USER', value: 'admin', label: 'Admin username' },
      { key: 'GF_SECURITY_ADMIN_PASSWORD', value: 'changeme', label: 'Admin password', secret: true },
    ],
    webPortIndex: 0,
  },
  {
    id: 'influxdb',
    name: 'InfluxDB',
    description: 'Time series database designed for metrics, events and real-time analytics.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/influxdb.png',
    category: 'Monitoring',
    dockerImage: 'influxdb:2',
    defaultPorts: [
      { hostPort: 8086, containerPort: 8086, protocol: 'tcp', label: 'HTTP API / UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/influxdb/data', containerPath: '/var/lib/influxdb2', label: 'Data' },
      { hostPath: '/opt/homestore/influxdb/config', containerPath: '/etc/influxdb2', label: 'Config' },
    ],
    defaultEnvVars: [
      { key: 'DOCKER_INFLUXDB_INIT_MODE', value: 'setup', label: 'Init mode' },
      { key: 'DOCKER_INFLUXDB_INIT_USERNAME', value: 'admin', label: 'Initial admin username' },
      { key: 'DOCKER_INFLUXDB_INIT_PASSWORD', value: 'changeme123', label: 'Initial admin password', secret: true },
      { key: 'DOCKER_INFLUXDB_INIT_ORG', value: 'homenas', label: 'Initial org' },
      { key: 'DOCKER_INFLUXDB_INIT_BUCKET', value: 'default', label: 'Initial bucket' },
    ],
    webPortIndex: 0,
  },
  // ── Automation ─────────────────────────────────────────────────────────────
  {
    id: 'home-assistant',
    name: 'Home Assistant',
    description: 'Open source home automation platform that puts local control and privacy first.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/home-assistant.png',
    category: 'Automation',
    dockerImage: 'ghcr.io/home-assistant/home-assistant:stable',
    defaultPorts: [
      { hostPort: 8123, containerPort: 8123, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/home-assistant/config', containerPath: '/config', label: 'Config' },
    ],
    defaultEnvVars: [
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
  {
    id: 'node-red',
    name: 'Node-RED',
    description: 'Low-code programming for event-driven applications and IoT automation.',
    icon: 'https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/node-red.png',
    category: 'Automation',
    dockerImage: 'nodered/node-red:latest',
    defaultPorts: [
      { hostPort: 1880, containerPort: 1880, protocol: 'tcp', label: 'Web UI' },
    ],
    defaultVolumes: [
      { hostPath: '/opt/homestore/node-red/data', containerPath: '/data', label: 'Data' },
    ],
    defaultEnvVars: [
      { key: 'TZ', value: 'Europe/Madrid', label: 'Timezone' },
    ],
    webPortIndex: 0,
  },
]

// ─── Pure command builder ─────────────────────────────────────────────────────
//
// Builds the full `docker run` argv (starting with 'run') for a container
// described by `config`. Pure: no I/O, no side-effects — both install and edit
// rely on it so the two paths produce byte-identical containers.
//
// NOTE: validation that touches the host (path existence, port collisions,
// image resolvability) lives in the callers — this function trusts its input.

export function buildDockerRunCommand(config: AppConfig): string[] {
  const args: string[] = ['run', '-d', '--name', config.containerName, '--restart', config.restartPolicy]

  // Resource limits — only emit flags when the user actually set a value.
  if (config.resources?.cpus && config.resources.cpus.trim() !== '') {
    args.push('--cpus', config.resources.cpus)
  }
  if (config.resources?.memory && config.resources.memory.trim() !== '') {
    args.push('--memory', config.resources.memory)
  }

  for (const p of config.ports) {
    const proto = p.protocol ?? 'tcp'
    args.push('-p', `${p.hostPort}:${p.containerPort}/${proto}`)
  }

  for (const v of config.volumes) {
    // Append `:ro` when the user explicitly marked the mount read-only. `rw`
    // is the docker default, so we omit the suffix to keep argv concise.
    const suffix = v.mode === 'ro' ? ':ro' : ''
    args.push('-v', `${v.hostPath}:${v.containerPath}${suffix}`)
  }

  for (const e of config.envVars) {
    if (e.key.includes('\0') || e.value.includes('\0')) continue
    if (e.value !== '') {
      args.push('-e', `${e.key}=${e.value}`)
    }
  }

  for (const arg of config.extraArgs) {
    args.push(arg)
  }

  args.push(config.dockerImage)
  return args
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function validateAppId(id: string): void {
  if (!/^[a-zA-Z0-9_-]+$/.test(id) || id.length > 64) {
    throw new Error('Invalid app ID')
  }
}

function getConfigPath(id: string): string {
  return join(HOMESTORE_DIR, `${id}.json`)
}

function ensureDir(): void {
  if (!existsSync(HOMESTORE_DIR)) {
    mkdirSync(HOMESTORE_DIR, { recursive: true })
  }
}

function readConfig(id: string): AppConfig | null {
  const path = getConfigPath(id)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as AppConfig
  } catch {
    return null
  }
}

function writeConfig(config: AppConfig): void {
  ensureDir()
  writeFileSync(getConfigPath(config.id), JSON.stringify(config, null, 2), 'utf8')
}

function deleteConfig(id: string): void {
  const path = getConfigPath(id)
  if (existsSync(path)) {
    rmSync(path)
  }
}

function containerName(id: string): string {
  return `homenas-${id}`
}

// ─── Status detection ─────────────────────────────────────────────────────────

interface DockerInspectResult {
  State?: {
    Status?: string
    Running?: boolean
  }
  Id?: string
}

async function getContainerStatus(name: string): Promise<{ status: AppStatus; containerId: string | null }> {
  const result = await exec('docker', ['inspect', '--format', '{{json .}}', name])
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return { status: 'notInstalled', containerId: null }
  }
  try {
    const info: DockerInspectResult = JSON.parse(result.stdout.trim())
    const id = info.Id?.substring(0, 12) ?? null
    const dockerState = info.State?.Status ?? ''
    let status: AppStatus
    if (dockerState === 'running') status = 'running'
    else if (dockerState === 'exited' || dockerState === 'stopped') status = 'stopped'
    else if (dockerState === 'created') status = 'stopped'
    else status = 'error'
    return { status, containerId: id }
  } catch {
    return { status: 'error', containerId: null }
  }
}

// ─── getCatalog ───────────────────────────────────────────────────────────────

async function buildCatalogEntry(def: AppDefinition): Promise<CatalogApp> {
  const config = readConfig(def.id)
  const name = config?.containerName ?? containerName(def.id)

  let status: AppStatus = 'notInstalled'
  let containerId: string | null = null
  let installedAt: number | null = null

  if (config) {
    installedAt = config.installedAt
    const stateResult = await getContainerStatus(name)
    status = stateResult.status
    containerId = stateResult.containerId ?? config.containerId
  }

  // Build web URL from config ports or default ports
  let webUrl: string | null = null
  const ports = config?.ports ?? def.defaultPorts
  const webPort = def.webPortIndex !== undefined ? ports[def.webPortIndex] : ports[0]
  if (webPort && status === 'running') {
    webUrl = `http://localhost:${webPort.hostPort}`
  }

  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    category: def.category,
    dockerImage: config?.dockerImage ?? def.dockerImage,
    defaultPorts: def.defaultPorts,
    defaultVolumes: def.defaultVolumes,
    defaultEnvVars: def.defaultEnvVars,
    status,
    containerId,
    containerName: config?.containerName ?? null,
    installedAt,
    webUrl,
  }
}

export async function getCatalog(): Promise<CatalogApp[]> {
  const apps: CatalogApp[] = []
  for (const def of APP_CATALOG) {
    apps.push(await buildCatalogEntry(def))
  }
  return apps
}

// ─── getApp ───────────────────────────────────────────────────────────────────

function findDefinition(id: string): AppDefinition {
  const def = APP_CATALOG.find((a) => a.id === id)
  if (!def) throw new Error(`App '${id}' not found in catalog`)
  return def
}

export async function getCatalogApp(id: string): Promise<CatalogApp> {
  validateAppId(id)
  return buildCatalogEntry(findDefinition(id))
}

// ─── getEffectiveConfig ───────────────────────────────────────────────────────
//
// Returns the currently persisted runtime config for a HomeStore-installed app
// (the same JSON we would feed back into `buildDockerRunCommand`). Used by the
// edit modal so it can prefill fields with what's actually running, not the
// catalog defaults.
//
// Returns `null` if the app is not installed → the route layer turns that into
// a 404 so the frontend can distinguish "no config" from a 500.

export async function getEffectiveConfig(id: string): Promise<EffectiveContainerConfig | null> {
  validateAppId(id)
  // The id must also be a known catalog app — we don't expose configs for
  // arbitrary docker containers through this endpoint.
  findDefinition(id)

  const config = readConfig(id)
  if (!config) return null

  return {
    dockerImage: config.dockerImage,
    ports: config.ports,
    volumes: config.volumes,
    envVars: config.envVars,
    restartPolicy: config.restartPolicy,
    extraArgs: config.extraArgs,
    ...(config.resources ? { resources: config.resources } : {}),
  }
}

// ─── installApp ───────────────────────────────────────────────────────────────

export async function installApp(id: string, payload: InstallPayload): Promise<void> {
  validateAppId(id)

  const def = findDefinition(id)

  // Check not already installed
  const existing = readConfig(id)
  if (existing) {
    const { status } = await getContainerStatus(existing.containerName)
    if (status !== 'notInstalled' && status !== 'error') {
      throw new Error(`App '${id}' is already installed`)
    }
  }

  const ports = payload.ports ?? def.defaultPorts
  const volumes = payload.volumes ?? def.defaultVolumes
  const envVars = payload.envVars ?? def.defaultEnvVars
  const restartPolicy = payload.restartPolicy ?? 'unless-stopped'
  const extraArgs = payload.extraArgs ?? []
  const resources = payload.resources
  const name = containerName(id)

  // Host-side validation that the pure builder cannot do.
  for (const v of volumes) {
    if (v.hostPath.includes('..') || v.containerPath.includes('..')) {
      throw new Error('Path traversal not allowed in volumes')
    }
    if (!v.hostPath.startsWith('/var/run')) {
      // Create host dir if needed — best effort, Docker will surface real errors.
      await exec('mkdir', ['-p', v.hostPath])
    }
  }
  for (const e of envVars) {
    if (e.key.includes('\0') || e.value.includes('\0')) {
      throw new Error('Null bytes not allowed in env vars')
    }
  }

  const config: AppConfig = {
    id,
    dockerImage: def.dockerImage,
    ports,
    volumes,
    envVars,
    containerId: null,
    containerName: name,
    installedAt: Math.floor(Date.now() / 1000),
    restartPolicy,
    extraArgs,
    ...(resources ? { resources } : {}),
  }

  const args = buildDockerRunCommand(config)
  const result = await exec('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'docker run failed')
  }

  config.containerId = result.stdout.trim().substring(0, 12)
  writeConfig(config)
}

// ─── uninstallApp ─────────────────────────────────────────────────────────────

export async function uninstallApp(id: string, removeData: boolean): Promise<void> {
  validateAppId(id)

  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  const name = config.containerName

  // Remove container (force stop + remove)
  const rmResult = await exec('docker', ['rm', '-f', name])
  if (rmResult.exitCode !== 0 && !rmResult.stderr.includes('No such container')) {
    throw new Error(rmResult.stderr || 'docker rm failed')
  }

  if (removeData) {
    for (const v of config.volumes) {
      if (v.hostPath.includes('..')) continue  // safety guard
      if (existsSync(v.hostPath)) {
        const rmDataResult = await exec('rm', ['-rf', v.hostPath])
        if (rmDataResult.exitCode !== 0) {
          // Log but don't fail — data removal is best effort
        }
      }
    }
  }

  deleteConfig(id)
}

// ─── startApp ────────────────────────────────────────────────────────────────

export async function startApp(id: string): Promise<void> {
  validateAppId(id)
  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  const result = await exec('docker', ['start', config.containerName])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'docker start failed')
}

// ─── stopApp ─────────────────────────────────────────────────────────────────

export async function stopApp(id: string): Promise<void> {
  validateAppId(id)
  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  const result = await exec('docker', ['stop', config.containerName])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'docker stop failed')
}

// ─── restartApp ──────────────────────────────────────────────────────────────

export async function restartApp(id: string): Promise<void> {
  validateAppId(id)
  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  const result = await exec('docker', ['restart', config.containerName])
  if (result.exitCode !== 0) throw new Error(result.stderr || 'docker restart failed')
}

// ─── updateApp ───────────────────────────────────────────────────────────────

export async function updateApp(id: string): Promise<void> {
  validateAppId(id)
  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  // Pull latest image
  const pullResult = await exec('docker', ['pull', config.dockerImage])
  if (pullResult.exitCode !== 0) throw new Error(pullResult.stderr || 'docker pull failed')

  // Stop and remove old container (no -v: preserve named volumes; bind mounts
  // live on the host and are unaffected by `docker rm`).
  await exec('docker', ['rm', '-f', config.containerName])

  // Re-create with the same config via the shared command builder.
  const runResult = await exec('docker', buildDockerRunCommand(config))
  if (runResult.exitCode !== 0) throw new Error(runResult.stderr || 'docker run failed after update')

  const newContainerId = runResult.stdout.trim().substring(0, 12)
  writeConfig({ ...config, containerId: newContainerId })
}

// ─── getAppLogs ───────────────────────────────────────────────────────────────

export async function getAppLogs(id: string): Promise<string> {
  validateAppId(id)
  const config = readConfig(id)
  if (!config) throw new Error(`App '${id}' is not installed`)

  const result = await exec('docker', ['logs', '--tail', '500', config.containerName])
  return [result.stdout, result.stderr].filter(Boolean).join('\n')
}

// ─── editApp ──────────────────────────────────────────────────────────────────

// Subset of `docker ps -a --format '{{json .}}'` rows used for port-conflict
// detection during edit. Only the fields we actually read are typed.
interface DockerPsRow {
  Names?: string
  Ports?: string
}

// Stable JSON serialization for diff comparison — sorted keys at every level so
// that two objects with identical content but differing key order compare equal.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']'
  }
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
}

// Returns the subset of fields that drive `docker run`. Comparing this subset
// (not the whole AppConfig) means cosmetic fields like `containerId` or
// `installedAt` never trigger a recreate.
function runtimeShape(config: AppConfig): Record<string, unknown> {
  return {
    dockerImage: config.dockerImage,
    ports: config.ports,
    volumes: config.volumes,
    envVars: config.envVars,
    restartPolicy: config.restartPolicy,
    extraArgs: config.extraArgs,
    resources: config.resources ?? null,
  }
}

function normalizeResources(r: ResourceLimits | undefined): ResourceLimits | undefined {
  if (!r) return undefined
  const cpus = r.cpus?.trim() ? r.cpus.trim() : undefined
  const memory = r.memory?.trim() ? r.memory.trim() : undefined
  if (!cpus && !memory) return undefined
  return { ...(cpus ? { cpus } : {}), ...(memory ? { memory } : {}) }
}

// Re-parse "0.0.0.0:8080->80/tcp, :::8080->80/tcp" into {hostPort, proto} pairs.
// Mirrors the parser in docker.service.ts but kept local to avoid cross-service
// coupling — both callers want a different output shape.
function extractPublishedHostPorts(portsStr: string): Array<{ hostPort: number; proto: string }> {
  if (!portsStr) return []
  const out: Array<{ hostPort: number; proto: string }> = []
  for (const entry of portsStr.split(',').map(s => s.trim())) {
    if (!entry) continue
    const m = entry.match(/(?:\S+:)?(\d+)->\d+\/(\w+)/)
    if (!m) continue
    const hostPort = parseInt(m[1], 10)
    if (!isNaN(hostPort)) out.push({ hostPort, proto: m[2] })
  }
  return out
}

// Look up published host ports across every container EXCEPT the one we're
// editing (matched by name). Returns a Set of "PORT/PROTO" strings.
async function getPublishedPortsFromOtherContainers(excludeName: string): Promise<Set<string>> {
  const taken = new Set<string>()
  const result = await exec('docker', ['ps', '-a', '--format', '{{json .}}'])
  if (result.exitCode !== 0 || !result.stdout.trim()) return taken

  for (const line of result.stdout.trim().split('\n')) {
    if (!line.trim()) continue
    let row: DockerPsRow
    try { row = JSON.parse(line) as DockerPsRow } catch { continue }
    const name = (row.Names ?? '').replace(/^\//, '').split(',')[0]
    if (name === excludeName) continue
    for (const p of extractPublishedHostPorts(row.Ports ?? '')) {
      taken.add(`${p.hostPort}/${p.proto}`)
    }
  }
  return taken
}

// Validate the merged config before we touch anything. Throws on the first
// problem so the caller can surface it as a 400 / 409 to the client.
async function validateEditedConfig(merged: AppConfig, original: AppConfig): Promise<void> {
  // Path traversal + null bytes — same rules as installApp.
  for (const v of merged.volumes) {
    if (v.hostPath.includes('..') || v.containerPath.includes('..')) {
      throw new Error('Path traversal not allowed in volumes')
    }
  }
  for (const e of merged.envVars) {
    if (e.key.includes('\0') || e.value.includes('\0')) {
      throw new Error('Null bytes not allowed in env vars')
    }
  }

  // Port conflicts: any host port we publish must not be claimed by a
  // *different* container. Same-container reuse is fine (we're recreating it).
  const taken = await getPublishedPortsFromOtherContainers(merged.containerName)
  for (const p of merged.ports) {
    const proto = p.protocol ?? 'tcp'
    if (taken.has(`${p.hostPort}/${proto}`)) {
      throw new Error(`Host port ${p.hostPort}/${proto} is already published by another container`)
    }
  }

  // Bind-mount host paths: the spec asks us to ensure the host path *exists*.
  // installApp creates missing dirs for the user; for edits we keep that
  // behaviour for paths the user already accepted (unchanged volumes) but
  // require new bind-mount sources to exist so a typo can't silently create
  // an empty dir on a privileged path.
  const previousHostPaths = new Set(original.volumes.map(v => v.hostPath))
  for (const v of merged.volumes) {
    if (v.hostPath.startsWith('/var/run')) continue // sockets, never mkdir
    if (previousHostPaths.has(v.hostPath)) {
      // Keep install-time behaviour for unchanged paths.
      if (!existsSync(v.hostPath)) {
        await exec('mkdir', ['-p', v.hostPath])
      }
      continue
    }
    if (!existsSync(v.hostPath)) {
      throw new Error(`Volume host path does not exist: ${v.hostPath}`)
    }
  }

  // Image must be resolvable. `docker pull --quiet` is a no-op for cached
  // images and a real network fetch otherwise — either way exitCode ≠ 0
  // means the tag does not resolve.
  if (merged.dockerImage !== original.dockerImage) {
    const pullResult = await exec('docker', ['pull', '--quiet', merged.dockerImage])
    if (pullResult.exitCode !== 0) {
      throw new Error(pullResult.stderr.trim() || `Cannot resolve image: ${merged.dockerImage}`)
    }
  }
}

export async function editApp(id: string, partial: EditPayload): Promise<EditResponse> {
  validateAppId(id)
  const original = readConfig(id)
  if (!original) throw new Error(`App '${id}' is not installed`)

  // Snapshot the running/stopped state BEFORE doing anything, so rollback can
  // restore it faithfully.
  const initialState = await getContainerStatus(original.containerName)
  const wasRunning = initialState.status === 'running'

  // Merge: arrays replace wholesale (matches install semantics — user always
  // sends the full list of ports/volumes/envVars they want), scalars overwrite
  // when present, resources normalise empty strings down to "unset".
  const merged: AppConfig = {
    ...original,
    ...(partial.dockerImage !== undefined ? { dockerImage: partial.dockerImage } : {}),
    ...(partial.ports !== undefined ? { ports: partial.ports } : {}),
    ...(partial.volumes !== undefined ? { volumes: partial.volumes } : {}),
    ...(partial.envVars !== undefined ? { envVars: partial.envVars } : {}),
    ...(partial.restartPolicy !== undefined ? { restartPolicy: partial.restartPolicy } : {}),
    ...(partial.extraArgs !== undefined ? { extraArgs: partial.extraArgs } : {}),
    ...(partial.resources !== undefined
      ? { resources: normalizeResources(partial.resources) }
      : {}),
  }

  // Idempotent short-circuit: nothing actually changed in the runtime shape.
  if (stableStringify(runtimeShape(original)) === stableStringify(runtimeShape(merged))) {
    return {
      ok: true,
      recreated: false,
      container: await getCatalogApp(id),
    }
  }

  // Validate the merged config; throws → caller maps to 4xx.
  await validateEditedConfig(merged, original)

  // Tear down the existing container. `docker rm` (no -v) preserves named
  // volumes; bind mounts live on the host, untouched. `docker stop` is a
  // best-effort step — `rm -f` would also work but a clean stop gives
  // applications a chance to flush.
  await exec('docker', ['stop', original.containerName])
  const rmResult = await exec('docker', ['rm', original.containerName])
  if (rmResult.exitCode !== 0 && !rmResult.stderr.includes('No such container')) {
    // Couldn't even remove the old container — nothing to roll back yet.
    throw new Error(rmResult.stderr || 'docker rm failed')
  }

  // Try to run the new config. On failure we *must* leave the user with a
  // working container — re-create from the original snapshot.
  const newRun = await exec('docker', buildDockerRunCommand(merged))
  if (newRun.exitCode !== 0) {
    const errMsg = newRun.stderr.trim() || 'docker run failed for new config'

    // Rollback: re-create the original container exactly as it was.
    const rollback = await exec('docker', buildDockerRunCommand(original))
    if (rollback.exitCode === 0) {
      const restoredId = rollback.stdout.trim().substring(0, 12)
      writeConfig({ ...original, containerId: restoredId })
      // If the original was stopped, leave it stopped — `run -d` started it.
      if (!wasRunning) {
        await exec('docker', ['stop', original.containerName])
      }
      return {
        ok: false,
        error: errMsg,
        rolledBack: true,
        container: await getCatalogApp(id),
      }
    }

    // Rollback itself failed. The on-disk config still describes the
    // original container; we just couldn't recreate it. Surface the worst
    // outcome so the operator (and the UI) can take manual action.
    return {
      ok: false,
      error: `${errMsg}; rollback also failed: ${rollback.stderr.trim() || 'unknown error'}`,
      rolledBack: false,
      container: await getCatalogApp(id),
    }
  }

  // Success — persist the new config.
  const newContainerId = newRun.stdout.trim().substring(0, 12)
  writeConfig({ ...merged, containerId: newContainerId })

  // Honour the prior state: if it was stopped before, stop it again. Matches
  // the principle of least surprise for users who deliberately keep apps
  // halted.
  if (!wasRunning) {
    await exec('docker', ['stop', merged.containerName])
  }

  return {
    ok: true,
    recreated: true,
    container: await getCatalogApp(id),
  }
}

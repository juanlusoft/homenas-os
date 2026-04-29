import { exec } from '../lib/exec.js'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type {
  CatalogApp,
  AppConfig,
  AppStatus,
  InstallPayload,
  PortMapping,
  VolumeMapping,
  EnvVar,
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

export async function getCatalog(): Promise<CatalogApp[]> {
  const apps: CatalogApp[] = []

  for (const def of APP_CATALOG) {
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

    apps.push({
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
    })
  }

  return apps
}

// ─── getApp ───────────────────────────────────────────────────────────────────

function findDefinition(id: string): AppDefinition {
  const def = APP_CATALOG.find((a) => a.id === id)
  if (!def) throw new Error(`App '${id}' not found in catalog`)
  return def
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
  const name = containerName(id)

  // Build docker run args — NO shell strings
  const args: string[] = ['run', '-d', '--name', name, '--restart', restartPolicy]

  for (const p of ports) {
    const proto = p.protocol ?? 'tcp'
    args.push('-p', `${p.hostPort}:${p.containerPort}/${proto}`)
  }

  for (const v of volumes) {
    // Reject path traversal
    if (v.hostPath.includes('..') || v.containerPath.includes('..')) {
      throw new Error('Path traversal not allowed in volumes')
    }
    // Create host dir if needed (best effort)
    if (!v.hostPath.startsWith('/var/run')) {
      const mkdirResult = await exec('mkdir', ['-p', v.hostPath])
      if (mkdirResult.exitCode !== 0) {
        // non-fatal — Docker will error on its own if the path is bad
      }
    }
    args.push('-v', `${v.hostPath}:${v.containerPath}`)
  }

  for (const e of envVars) {
    // Reject null bytes
    if (e.key.includes('\0') || e.value.includes('\0')) {
      throw new Error('Null bytes not allowed in env vars')
    }
    if (e.value !== '') {
      args.push('-e', `${e.key}=${e.value}`)
    }
  }

  for (const arg of extraArgs) {
    args.push(arg)
  }

  args.push(def.dockerImage)

  const result = await exec('docker', args)
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || 'docker run failed')
  }

  const containerId = result.stdout.trim().substring(0, 12)

  const config: AppConfig = {
    id,
    dockerImage: def.dockerImage,
    ports,
    volumes,
    envVars,
    containerId,
    containerName: name,
    installedAt: Math.floor(Date.now() / 1000),
    restartPolicy,
    extraArgs,
  }
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

  // Stop and remove old container
  await exec('docker', ['rm', '-f', config.containerName])

  // Re-create with same config
  const args: string[] = ['run', '-d', '--name', config.containerName, '--restart', config.restartPolicy]

  for (const p of config.ports) {
    const proto = p.protocol ?? 'tcp'
    args.push('-p', `${p.hostPort}:${p.containerPort}/${proto}`)
  }

  for (const v of config.volumes) {
    args.push('-v', `${v.hostPath}:${v.containerPath}`)
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

  const runResult = await exec('docker', args)
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

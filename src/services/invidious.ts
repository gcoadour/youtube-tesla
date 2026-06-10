const INSTANCES_API = 'https://api.invidious.io/instances.json'
const REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes

export interface InvidiousInstance {
  uri: string
  apiUrl: string
  cors: boolean
  api: boolean
  uptime: number
  playbackRatio: number
  lastCheckAt: string
  score: number
  penalizedUntil: number
}

interface InstanceScore {
  uptime: number
  playbackRatio: number
  recency: number
}

let instances: InvidiousInstance[] = []
let lastFetch = 0

function computeScore(monitor: any, playback: any): InstanceScore {
  const uptime = monitor?.uptime ?? 50
  const playbackRatio = playback?.ratio ?? 0.5
  const lastCheck = monitor?.last_check_at ?? ''
  const recency = lastCheck
    ? Math.max(0, 100 - (Date.now() - new Date(lastCheck).getTime()) / (60 * 60 * 1000))
    : 50

  return { uptime, playbackRatio, recency }
}

function calculateFinalScore(s: InstanceScore): number {
  return s.uptime * 0.4 + s.playbackRatio * 100 * 0.4 + s.recency * 0.2
}

function sortInstances(): void {
  instances.sort((a, b) => b.score - a.score)
}

export async function fetchInstances(): Promise<void> {
  const now = Date.now()
  if (instances.length > 0 && now - lastFetch < REFRESH_INTERVAL) return

  try {
    const res = await fetch(INSTANCES_API)
    if (!res.ok) return

    const data: [string, any][] = await res.json()
    const parsed: InvidiousInstance[] = []

    for (const [, info] of data) {
      if (info.type !== 'https') continue
      if (info.cors !== true) continue
      if (!info.uri) continue

      const s = computeScore(info.monitor, info.stats?.playback)
      parsed.push({
        uri: info.uri,
        apiUrl: `${info.uri}/api/v1`,
        cors: info.cors,
        api: info.api ?? false,
        uptime: s.uptime,
        playbackRatio: s.playbackRatio,
        lastCheckAt: info.monitor?.last_check_at ?? '',
        score: calculateFinalScore(s),
        penalizedUntil: 0,
      })
    }

    if (parsed.length > 0) {
      instances = parsed
      sortInstances()
      lastFetch = now
    }
  } catch {
    // keep existing instances on fetch failure
  }
}

export function getAvailableInstances(): InvidiousInstance[] {
  const now = Date.now()
  return instances.filter(i => i.penalizedUntil < now)
}

export function penalizeInstance(uri: string, durationMs: number = 60_000): void {
  const inst = instances.find(i => i.uri === uri)
  if (inst) {
    inst.score *= 0.5
    inst.penalizedUntil = Date.now() + durationMs
    sortInstances()
  }
}

export function boostInstance(uri: string): void {
  const inst = instances.find(i => i.uri === uri)
  if (inst) {
    inst.score = Math.min(100, inst.score * 1.1)
    sortInstances()
  }
}

export async function fetchFromInvidious(
  path: string,
  options?: RequestInit,
  maxAttempts: number = 3
): Promise<{ data: any; instanceUri: string }> {
  await fetchInstances()
  const available = getAvailableInstances()

  if (available.length === 0) {
    throw new Error('No Invidious instances available')
  }

  let lastError: Error | null = null
  const tried = new Set<string>()

  for (let attempt = 0; attempt < maxAttempts && attempt < available.length; attempt++) {
    const instance = available.find(i => !tried.has(i.uri)) ?? available[0]
    tried.add(instance.uri)

    try {
      const res = await fetch(`${instance.apiUrl}${path}`, options)
      if (!res.ok) {
        penalizeInstance(instance.uri)
        lastError = new Error(`HTTP ${res.status}`)
        continue
      }

      const data = await res.json()
      if (data?.error) {
        penalizeInstance(instance.uri)
        lastError = new Error(data.error)
        continue
      }

      boostInstance(instance.uri)
      return { data, instanceUri: instance.uri }
    } catch (err) {
      penalizeInstance(instance.uri)
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('All Invidious instances failed')
}

export async function getAudioUrlFromInvidious(videoId: string): Promise<string> {
  const { data } = await fetchFromInvidious(`/videos/${encodeURIComponent(videoId)}`)

  const audioFormats = (data.adaptiveFormats || [])
    .filter((f: any) => f.type?.startsWith('audio/'))
    .sort((a: any, b: any) => b.bitrate - a.bitrate)

  if (audioFormats.length > 0) return audioFormats[0].url
  if (data.formatStreams?.length > 0) return data.formatStreams[0].url

  throw new Error('No audio formats found')
}

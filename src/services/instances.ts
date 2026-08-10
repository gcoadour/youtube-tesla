/**
 * Découverte et classement des instances Invidious / Piped.
 *
 * Les instances Invidious proviennent de l'API officielle
 * https://api.invidious.io/instances.json. La réponse est mise en cache dans
 * localStorage : une indisponibilité passagère de l'API ne doit pas priver
 * l'application de toute source. Une poignée d'instances documentées sert de
 * dernier recours au tout premier lancement, si l'API n'a jamais répondu.
 *
 * Piped n'expose pas d'annuaire équivalent : ses instances restent listées ici
 * et sont vérifiées par un health-check.
 */

const INSTANCES_API = 'https://api.invidious.io/instances.json'
const STORAGE_KEY = 'yt-instances'
const REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes
const REQUEST_TIMEOUT = 6000

/** Délai laissé à une instance pour prouver qu'elle répond (diagnostic inclus). */
export const audioProbeTimeout = 8000
const DEFAULT_SCORE = 50

export type InstanceKind = 'invidious' | 'piped'

export interface Instance {
  kind: InstanceKind
  /** Origine sans slash final, ex. https://inv.nadeko.net */
  origin: string
  /** Base de l'API, ex. https://inv.nadeko.net/api/v1 */
  apiUrl: string
  score: number
  penalizedUntil: number
  /** true tant qu'aucune vérification n'a eu lieu */
  unverified: boolean
  /** Ajoutée à la main : jamais retirée par un rafraîchissement */
  userAdded: boolean
}

/**
 * Amorçage à froid : instances publiques documentées sur
 * https://docs.invidious.io/instances/. Utilisées uniquement si l'API n'a
 * jamais pu être jointe et qu'aucun cache n'existe.
 */
const COLD_START_INVIDIOUS = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si',
]

/** Instances Piped (API). Leurs flux audio sont déjà relayés avec CORS. */
const PIPED_SEEDS = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://pipedapi.nosebs.ru',
  'https://api.piped.private.coffee',
]

function apiUrlFor(kind: InstanceKind, origin: string): string {
  return kind === 'invidious' ? `${origin}/api/v1` : origin
}

function makeInstance(kind: InstanceKind, origin: string, userAdded = false): Instance {
  const clean = origin.replace(/\/+$/, '')
  return {
    kind,
    origin: clean,
    apiUrl: apiUrlFor(kind, clean),
    score: DEFAULT_SCORE,
    penalizedUntil: 0,
    unverified: true,
    userAdded,
  }
}

let instances: Instance[] = []
let lastApiFetch = 0
let lastPipedCheck = 0
let refreshPromise: Promise<void> | null = null

function sortInstances(): void {
  instances.sort((a, b) => b.score - a.score)
}

async function fetchWithTimeout(url: string, ms = REQUEST_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// --- persistance -------------------------------------------------------------

interface StoredInstance {
  kind: InstanceKind
  origin: string
  score: number
  userAdded: boolean
}

function persist(): void {
  try {
    const payload: StoredInstance[] = instances.map((i) => ({
      kind: i.kind,
      origin: i.origin,
      score: i.score,
      userAdded: i.userAdded,
    }))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // Stockage plein ou indisponible : le classement en mémoire suffit.
  }
}

function load(): void {
  let stored: StoredInstance[] = []
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    stored = []
  }

  const byOrigin = new Map<string, Instance>()

  for (const s of stored) {
    if (!s?.origin || (s.kind !== 'invidious' && s.kind !== 'piped')) continue
    byOrigin.set(s.origin, {
      ...makeInstance(s.kind, s.origin, !!s.userAdded),
      score: typeof s.score === 'number' ? s.score : DEFAULT_SCORE,
    })
  }

  // Piped n'a pas d'annuaire : ses instances sont toujours réinjectées.
  for (const origin of PIPED_SEEDS) {
    if (!byOrigin.has(origin)) byOrigin.set(origin, makeInstance('piped', origin))
  }

  // Amorçage à froid : aucune instance Invidious connue.
  if (![...byOrigin.values()].some((i) => i.kind === 'invidious')) {
    for (const origin of COLD_START_INVIDIOUS) {
      byOrigin.set(origin, makeInstance('invidious', origin))
    }
  }

  instances = [...byOrigin.values()]
  sortInstances()
}

load()

// --- annuaire Invidious ------------------------------------------------------

/**
 * Le champ `monitor` de l'API a changé de forme au fil des versions ; on lit
 * les variantes connues plutôt que de supposer une seule structure.
 */
function uptimeOf(monitor: any): number {
  if (typeof monitor?.uptime === 'number') return monitor.uptime
  const ratio = monitor?.['30dRatio']?.ratio ?? monitor?.['90dRatio']?.ratio
  const parsed = parseFloat(ratio)
  return Number.isFinite(parsed) ? parsed : DEFAULT_SCORE
}

function playbackRatioOf(stats: any): number {
  const playback = stats?.playback
  if (typeof playback?.ratio === 'number') return playback.ratio
  const total = playback?.totalRequests
  const ok = playback?.successfulRequests
  if (typeof total === 'number' && total > 0 && typeof ok === 'number') return ok / total
  return 0.5
}

function scoreFromApi(info: any): number {
  const uptime = uptimeOf(info?.monitor)
  const playback = playbackRatioOf(info?.stats)
  // CORS est indispensable depuis un navigateur : une instance qui l'annonce
  // explicitement passe devant celles dont le champ est absent.
  const corsBonus = info?.cors === true ? 10 : 0
  return Math.min(100, uptime * 0.5 + playback * 100 * 0.4 + corsBonus)
}

async function refreshFromApi(): Promise<void> {
  const res = await fetchWithTimeout(INSTANCES_API)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data: [string, any][] = await res.json()
  if (!Array.isArray(data) || data.length === 0) throw new Error('Réponse vide')

  const discovered: Instance[] = []
  for (const entry of data) {
    const info = Array.isArray(entry) ? entry[1] : null
    if (!info?.uri) continue
    // Seules les instances HTTPS avec API et CORS sont exploitables ici :
    // onion/i2p sont injoignables depuis la voiture, et une instance sans CORS
    // échouerait à chaque requête du navigateur.
    if (info.type !== 'https') continue
    if (info.api === false) continue
    if (info.cors === false) continue

    discovered.push({
      ...makeInstance('invidious', info.uri),
      score: scoreFromApi(info),
      unverified: false,
    })
  }

  if (discovered.length === 0) throw new Error('Aucune instance exploitable')

  const kept = instances.filter(
    (i) => i.kind === 'piped' || (i.userAdded && !discovered.some((d) => d.origin === i.origin)),
  )
  // Un ajout manuel garde la priorité que l'utilisateur lui a donnée.
  const manual = new Map(instances.filter((i) => i.userAdded).map((i) => [i.origin, i]))
  for (const d of discovered) {
    const existing = manual.get(d.origin)
    if (existing) {
      d.userAdded = true
      d.score = Math.max(d.score, existing.score)
    }
  }

  instances = [...discovered, ...kept]
  sortInstances()
  persist()
  lastApiFetch = Date.now()
}

// --- health-check Piped ------------------------------------------------------

async function checkPiped(inst: Instance): Promise<void> {
  try {
    const res = await fetchWithTimeout(`${inst.apiUrl}/healthcheck`, 4000)
    inst.unverified = false
    if (res.ok) {
      inst.score = Math.min(100, inst.score + 25)
      inst.penalizedUntil = 0
    } else {
      inst.score = Math.max(1, inst.score - 25)
      inst.penalizedUntil = Date.now() + 5 * 60_000
    }
  } catch {
    inst.unverified = false
    inst.score = Math.max(1, inst.score - 25)
    inst.penalizedUntil = Date.now() + 5 * 60_000
  }
}

/**
 * Rafraîchit l'annuaire Invidious et vérifie les instances Piped.
 * Throttlé, et idempotent : les appels concurrents partagent la même promesse.
 */
export function checkInstances(force = false): Promise<void> {
  const now = Date.now()
  const apiStale = force || now - lastApiFetch >= REFRESH_INTERVAL
  const pipedStale = force || now - lastPipedCheck >= REFRESH_INTERVAL

  if (!apiStale && !pipedStale) return refreshPromise ?? Promise.resolve()
  if (refreshPromise) return refreshPromise

  const jobs: Promise<unknown>[] = []
  if (apiStale) {
    jobs.push(
      refreshFromApi().catch(() => {
        // L'API n'a pas répondu : on garde le cache et on réessaiera au
        // prochain cycle plutôt que de vider la liste.
      }),
    )
  }
  if (pipedStale) {
    lastPipedCheck = now
    jobs.push(Promise.all(instances.filter((i) => i.kind === 'piped').map(checkPiped)))
  }

  refreshPromise = Promise.all(jobs)
    .then(() => {
      sortInstances()
      persist()
    })
    .finally(() => {
      refreshPromise = null
    })

  return refreshPromise
}

// --- sélection et scoring ----------------------------------------------------

export function getInstances(kind?: InstanceKind): Instance[] {
  return kind ? instances.filter((i) => i.kind === kind) : [...instances]
}

/**
 * Instances utilisables d'une famille, les mieux classées d'abord.
 * Si toutes sont pénalisées, on les rend quand même : mieux vaut retenter que
 * refuser la requête.
 */
export function getAvailableInstances(kind: InstanceKind): Instance[] {
  const now = Date.now()
  const usable = instances.filter((i) => i.kind === kind && i.penalizedUntil < now)
  return usable.length > 0 ? usable : instances.filter((i) => i.kind === kind)
}

export function penalizeInstance(origin: string, durationMs = 60_000): void {
  const inst = instances.find((i) => i.origin === origin)
  if (!inst) return
  inst.score = Math.max(1, inst.score * 0.5)
  inst.penalizedUntil = Date.now() + durationMs
  sortInstances()
  persist()
}

export function boostInstance(origin: string): void {
  const inst = instances.find((i) => i.origin === origin)
  if (!inst) return
  inst.score = Math.min(100, inst.score * 1.1 + 1)
  inst.penalizedUntil = 0
  sortInstances()
  persist()
}

// --- gestion manuelle (page Réglages) ----------------------------------------

export function addUserInstance(kind: InstanceKind, origin: string): Instance | null {
  const clean = origin.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/]+$/.test(clean)) return null

  const existing = instances.find((i) => i.origin === clean)
  if (existing) {
    existing.userAdded = true
    persist()
    return existing
  }

  // Score élevé au départ : un ajout manuel est un choix délibéré.
  const inst = { ...makeInstance(kind, clean, true), score: 80 }
  instances.push(inst)
  sortInstances()
  persist()
  return inst
}

export function removeUserInstance(origin: string): void {
  instances = instances.filter((i) => !(i.origin === origin && i.userAdded))
  persist()
}

export function prioritizeInstance(origin: string): void {
  const inst = instances.find((i) => i.origin === origin)
  if (!inst) return
  inst.score = 100
  inst.penalizedUntil = 0
  sortInstances()
  persist()
}

// --- requêtes ----------------------------------------------------------------

export interface InstanceResponse {
  data: any
  instance: Instance
}

export interface FetchOptions {
  /** Origines déjà essayées sans succès, à ne pas retenter. */
  exclude?: Iterable<string>
  /** Par défaut : toutes les instances disponibles. */
  maxAttempts?: number
  request?: RequestInit
}

/**
 * Interroge les instances d'une famille en cascade.
 *
 * Toute erreur — réseau, HTTP, ou erreur applicative renvoyée par l'instance —
 * fait passer à l'instance suivante, et ainsi de suite jusqu'à épuisement de la
 * liste. Chaque échec pénalise l'instance et chaque succès la favorise, si bien
 * que celles qui répondent aujourd'hui remontent d'elles-mêmes en tête.
 */
export async function fetchFromInstances(
  kind: InstanceKind,
  path: string,
  options: FetchOptions = {},
): Promise<InstanceResponse> {
  await checkInstances()

  const exclude = new Set(options.exclude ?? [])
  const candidates = getAvailableInstances(kind).filter((i) => !exclude.has(i.origin))

  if (candidates.length === 0) {
    throw new Error(`Aucune instance ${kind} disponible`)
  }

  const attempts = Math.min(options.maxAttempts ?? candidates.length, candidates.length)

  // On retient l'échec de chaque instance : un message ne citant que la
  // dernière ne dit pas si le problème vient d'une instance ou de toutes.
  const failures: string[] = []

  for (let i = 0; i < attempts; i++) {
    const instance = candidates[i]
    const host = instance.origin.replace(/^https?:\/\//, '')
    try {
      const res = await fetch(`${instance.apiUrl}${path}`, options.request)
      if (!res.ok) {
        penalizeInstance(instance.origin)
        failures.push(`${host} HTTP ${res.status}`)
        continue
      }

      const data = await res.json()
      if (data?.error) {
        // L'instance répond mais ne peut pas servir cette ressource (playlist
        // privée, vidéo bloquée). Pénalité courte : la faute n'est pas la sienne.
        penalizeInstance(instance.origin, 10_000)
        failures.push(`${host} : ${String(data.error)}`)
        continue
      }

      boostInstance(instance.origin)
      return { data, instance }
    } catch (err) {
      penalizeInstance(instance.origin)
      // « Load failed » / « Failed to fetch » : le navigateur a refusé la
      // réponse, presque toujours faute d'en-tête CORS sur l'instance.
      const reason = err instanceof Error ? err.message : String(err)
      failures.push(`${host} : ${reason}`)
    }
  }

  throw new Error(
    `${attempts} instance${attempts > 1 ? 's' : ''} ${kind} sans réponse exploitable — ${summarize(failures)}`,
  )
}

/** Limite la longueur du message tout en gardant les premières causes. */
function summarize(failures: string[], max = 3): string {
  if (failures.length === 0) return 'cause inconnue'
  const shown = failures.slice(0, max).join(' ; ')
  const rest = failures.length - max
  return rest > 0 ? `${shown} ; et ${rest} autre${rest > 1 ? 's' : ''}` : shown
}

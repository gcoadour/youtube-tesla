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

import { proxyVariants } from './corsProxy'

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
  /**
   * Capacité CORS déclarée par l'annuaire, en **trois états** :
   * `true` (annoncée), `false` (explicitement absente), `undefined` (inconnue).
   *
   * La distinction est capitale. L'annuaire renvoie aujourd'hui très souvent un
   * champ nul, faute de monitoring à jour. Traiter cet « inconnu » comme un
   * refus revenait à exclure toutes les instances Invidious des appels d'API et
   * à ne laisser que Piped. Seul un `false` explicite écarte une instance ; dans
   * le doute on essaie, et l'échec éventuel la pénalise comme n'importe quel
   * autre.
   *
   * Un flux audio lu par <audio> n'est de toute façon pas soumis au CORS : ce
   * champ ne concerne que les appels JSON.
   */
  cors?: boolean
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

function makeInstance(
  kind: InstanceKind,
  origin: string,
  userAdded = false,
  cors?: boolean,
): Instance {
  const clean = origin.replace(/\/+$/, '')
  return {
    kind,
    origin: clean,
    apiUrl: apiUrlFor(kind, clean),
    score: DEFAULT_SCORE,
    penalizedUntil: 0,
    cors,
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

async function fetchWithTimeout(
  url: string,
  ms = REQUEST_TIMEOUT,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
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
  /** null = inconnu (undefined ne survit pas à JSON.stringify). */
  cors?: boolean | null
}

function persist(): void {
  try {
    const payload: StoredInstance[] = instances.map((i) => ({
      kind: i.kind,
      origin: i.origin,
      score: i.score,
      userAdded: i.userAdded,
      cors: i.cors ?? null,
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
      ...makeInstance(
        s.kind,
        s.origin,
        !!s.userAdded,
        s.cors === null || s.cors === undefined ? undefined : s.cors,
      ),
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
    // onion/i2p sont injoignables depuis la voiture.
    if (info.type !== 'https') continue
    if (info.api === false) continue

    // Les instances sans CORS ne sont plus écartées, mais marquées : elles
    // restent bonnes pour la lecture, et sont exclues des appels d'API.
    discovered.push({
      ...makeInstance(
        'invidious',
        info.uri,
        false,
        info.cors === true ? true : info.cors === false ? false : undefined,
      ),
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
 *
 * `corsOnly` écarte les instances dont l'annuaire indique explicitement qu'elles
 * ne servent pas le CORS : les interroger pour un appel JSON est du temps perdu.
 * Une capacité inconnue reste éligible — voir le champ `cors`.
 *
 * Si toutes les instances retenues sont pénalisées, on les rend quand même :
 * mieux vaut retenter que refuser la requête.
 */
export function getAvailableInstances(
  kind: InstanceKind,
  options: { corsOnly?: boolean } = {},
): Instance[] {
  const now = Date.now()
  const eligible = instances.filter(
    (i) => i.kind === kind && (!options.corsOnly || i.cors !== false),
  )
  const usable = eligible.filter((i) => i.penalizedUntil < now)
  return usable.length > 0 ? usable : eligible
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

/**
 * Nombre d'instances essayées par défaut pour un appel d'API.
 *
 * Une valeur non bornée avait l'air plus robuste, mais l'annuaire renvoie
 * plusieurs dizaines d'instances : une recherche pouvait toutes les parcourir
 * en série, ce qui la rendait interminable au lieu d'échouer franchement.
 */
const DEFAULT_MAX_ATTEMPTS = 4

/**
 * Instances reprises via un relais CORS quand tout le direct a échoué.
 * Volontairement bas : chaque instance est retentée avec plusieurs relais, et
 * le produit des deux deviendrait vite interminable.
 */
const PROXY_INSTANCE_ATTEMPTS = 2

export interface FetchOptions {
  /** Origines déjà essayées sans succès, à ne pas retenter. */
  exclude?: Iterable<string>
  /** Nombre d'instances à essayer. Par défaut DEFAULT_MAX_ATTEMPTS. */
  maxAttempts?: number
  request?: RequestInit
  /** Délai laissé à chaque instance. */
  timeoutMs?: number
  /** Rejette une réponse par ailleurs valide, pour passer à l'instance suivante. */
  accept?: (data: any) => boolean
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
  // Tout ce qui passe par ici est du JSON lu par fetch : CORS obligatoire.
  const candidates = getAvailableInstances(kind, { corsOnly: true })
    .filter((i) => !exclude.has(i.origin))

  if (candidates.length === 0) {
    throw new Error(`aucune instance ${kind} ne permet les appels d'API (CORS)`)
  }

  const attempts = Math.min(options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, candidates.length)

  // On retient l'échec de chaque instance : un message ne citant que la
  // dernière ne dit pas si le problème vient d'une instance ou de toutes.
  const failures: string[] = []

  for (let i = 0; i < attempts; i++) {
    const instance = candidates[i]
    const host = instance.origin.replace(/^https?:\/\//, '')
    try {
      // Sans délai d'attente, une seule instance qui ne répond jamais suffisait
      // à bloquer toute la cascade.
      const res = await fetchWithTimeout(
        `${instance.apiUrl}${path}`,
        options.timeoutMs ?? REQUEST_TIMEOUT,
        options.request,
      )
      if (!res.ok) {
        penalizeInstance(instance.origin)
        failures.push(`${host} HTTP ${res.status}`)
        continue
      }

      /*
       * La liste officielle impose désormais aux instances publiques un
       * dispositif anti-bot (règle 14). Une requête inter-origine sans défi
       * résolu reçoit donc souvent une page HTML en 200, et non du JSON. Le
       * signaler comme tel évite de faire passer un blocage anti-bot pour une
       * panne d'instance.
       */
      let data: any
      try {
        data = await res.json()
      } catch {
        penalizeInstance(instance.origin)
        failures.push(`${host} : réponse non-JSON (défi anti-bot ?)`)
        continue
      }

      if (data?.error) {
        // L'instance répond mais ne peut pas servir cette ressource (playlist
        // privée, vidéo bloquée). Pénalité courte : la faute n'est pas la sienne.
        penalizeInstance(instance.origin, 10_000)
        failures.push(`${host} : ${String(data.error)}`)
        continue
      }

      // Une réponse 200 syntaxiquement valide mais inexploitable (mauvaise
      // forme, résultat vide) ne doit pas clore la cascade : l'appelant décide.
      if (options.accept && !options.accept(data)) {
        penalizeInstance(instance.origin, 30_000)
        failures.push(`${host} : réponse inexploitable`)
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

  /*
   * Seconde chance par relais CORS. N'intervient qu'ici, une fois tout le
   * direct épuisé : le direct est plus rapide, ne dépend de personne et
   * n'expose pas la requête à un tiers.
   */
  for (const instance of candidates.slice(0, PROXY_INSTANCE_ATTEMPTS)) {
    const host = instance.origin.replace(/^https?:\/\//, '')
    for (const { proxy, url } of proxyVariants(`${instance.apiUrl}${path}`)) {
      try {
        const res = await fetchWithTimeout(url, options.timeoutMs ?? REQUEST_TIMEOUT, options.request)
        if (!res.ok) {
          failures.push(`${host} via ${proxy.label} HTTP ${res.status}`)
          continue
        }
        let data: any
        try {
          data = await res.json()
        } catch {
          failures.push(`${host} via ${proxy.label} : réponse non-JSON`)
          continue
        }
        if (data?.error) {
          failures.push(`${host} via ${proxy.label} : ${String(data.error)}`)
          continue
        }
        if (options.accept && !options.accept(data)) {
          failures.push(`${host} via ${proxy.label} : réponse inexploitable`)
          continue
        }
        boostInstance(instance.origin)
        return { data, instance }
      } catch (err) {
        failures.push(`${host} via ${proxy.label} : ${err instanceof Error ? err.message : String(err)}`)
      }
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

/**
 * Découverte et classement des instances publiques Invidious / Piped.
 *
 * L'ancienne implémentation dépendait de https://api.invidious.io/instances.json,
 * qui n'est plus maintenue : dès qu'elle échouait, la liste restait vide et toute
 * l'application (recherche, import, lecture) tombait sur « No instances available ».
 *
 * On part donc d'une liste embarquée, on la vérifie au démarrage par un health-check
 * parallèle, et on classe les instances par score. Les échecs pénalisent, les succès
 * favorisent. L'utilisateur peut ajouter/prioriser une instance depuis les Réglages,
 * ce qui est le seul recours quand une instance publique se fait bloquer par YouTube.
 */

export type InstanceKind = 'invidious' | 'piped'

export interface Instance {
  kind: InstanceKind
  /** Origine sans slash final, ex. https://yewtu.be */
  origin: string
  /** Base de l'API, ex. https://yewtu.be/api/v1 */
  apiUrl: string
  score: number
  penalizedUntil: number
  /** true tant que le health-check n'a pas répondu */
  unverified: boolean
  /** Ajoutée à la main par l'utilisateur : jamais retirée automatiquement */
  userAdded: boolean
}

const STORAGE_KEY = 'yt-instances'
const REFRESH_INTERVAL = 30 * 60 * 1000 // 30 minutes
const HEALTH_TIMEOUT = 4000
const DEFAULT_SCORE = 50

/**
 * Instances Invidious publiques officielles, dans l'ordre de la documentation
 * (de la plus ancienne à la plus récente) :
 * https://docs.invidious.io/instances/ — relevé le 2026-08-10.
 *
 * La documentation avertit que « toute instance publique absente de cette liste
 * est considérée comme non fiable », d'où le choix de n'embarquer que celles-ci.
 * La liste est courte et bouge : à réviser depuis la source ci-dessus quand la
 * lecture devient instable, ou à compléter au cas par cas depuis Réglages.
 */
const INVIDIOUS_SEEDS = [
  'https://inv.nadeko.net',          // CL — protégée par un défi anti-bot « Go-away »
  'https://invidious.nerdvpn.de',    // UA
  'https://yt.chocolatemoo53.com',   // US
  'https://invidious.tiekoetter.com',// DE
  'https://invidious.f5.si',         // JP
]

/** Instances Piped (API). Les flux audio Piped sont déjà relayés avec CORS. */
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

function seedInstances(): Instance[] {
  return [
    ...INVIDIOUS_SEEDS.map((o) => makeInstance('invidious', o)),
    ...PIPED_SEEDS.map((o) => makeInstance('piped', o)),
  ]
}

let instances: Instance[] = []
let lastHealthCheck = 0
let healthPromise: Promise<void> | null = null

function sortInstances(): void {
  instances.sort((a, b) => b.score - a.score)
}

// --- persistance -----------------------------------------------------------

interface StoredInstance {
  kind: InstanceKind
  origin: string
  score: number
  userAdded: boolean
}

function load(): void {
  const seeds = seedInstances()
  let stored: StoredInstance[] = []
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    stored = []
  }

  const byOrigin = new Map(seeds.map((i) => [i.origin, i]))
  for (const s of stored) {
    if (!s?.origin || (s.kind !== 'invidious' && s.kind !== 'piped')) continue
    const existing = byOrigin.get(s.origin)
    if (existing) {
      // On reprend le score appris lors des sessions précédentes.
      existing.score = typeof s.score === 'number' ? s.score : DEFAULT_SCORE
      existing.userAdded = existing.userAdded || !!s.userAdded
    } else if (s.userAdded) {
      byOrigin.set(s.origin, { ...makeInstance(s.kind, s.origin, true), score: s.score ?? DEFAULT_SCORE })
    }
  }

  instances = [...byOrigin.values()]
  sortInstances()
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
    // quota plein ou stockage indisponible : le classement en mémoire suffit
  }
}

load()

// --- health-check ----------------------------------------------------------

function healthPath(kind: InstanceKind): string {
  return kind === 'invidious' ? '/stats' : '/healthcheck'
}

async function checkOne(inst: Instance): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT)
  try {
    const res = await fetch(`${inst.apiUrl}${healthPath(inst.kind)}`, {
      signal: controller.signal,
    })
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
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Vérifie toutes les instances en parallèle. Idempotent et throttlé :
 * un appel pendant un check en cours attend simplement le même résultat.
 */
export function checkInstances(force = false): Promise<void> {
  const now = Date.now()
  if (!force && now - lastHealthCheck < REFRESH_INTERVAL && lastHealthCheck > 0) {
    return healthPromise ?? Promise.resolve()
  }
  if (healthPromise) return healthPromise

  lastHealthCheck = now
  healthPromise = Promise.all(instances.map(checkOne))
    .then(() => {
      sortInstances()
      persist()
    })
    .finally(() => {
      healthPromise = null
    })
  return healthPromise
}

// --- sélection et scoring --------------------------------------------------

export function getInstances(kind?: InstanceKind): Instance[] {
  return kind ? instances.filter((i) => i.kind === kind) : [...instances]
}

export function getAvailableInstances(kind: InstanceKind): Instance[] {
  const now = Date.now()
  const usable = instances.filter((i) => i.kind === kind && i.penalizedUntil < now)
  // Si tout est pénalisé, on retente quand même plutôt que d'échouer sèchement.
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

// --- gestion manuelle (page Réglages) --------------------------------------

export function addUserInstance(kind: InstanceKind, origin: string): Instance | null {
  const clean = origin.trim().replace(/\/+$/, '')
  if (!/^https:\/\/[^\s/]+$/.test(clean)) return null
  const existing = instances.find((i) => i.origin === clean)
  if (existing) {
    existing.userAdded = true
    persist()
    return existing
  }
  // Score de départ élevé : un ajout manuel est un choix délibéré.
  const inst = { ...makeInstance(kind, clean, true), score: 80 }
  instances.push(inst)
  sortInstances()
  persist()
  checkOne(inst).then(() => {
    sortInstances()
    persist()
  })
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

// --- requêtes --------------------------------------------------------------

export interface InstanceResponse {
  data: any
  instance: Instance
}

/**
 * Interroge les instances d'une famille en cascade jusqu'à obtenir une réponse.
 * Chaque échec pénalise l'instance, chaque succès la favorise, ce qui fait
 * remonter naturellement les instances qui marchent aujourd'hui.
 */
export async function fetchFromInstances(
  kind: InstanceKind,
  path: string,
  options?: RequestInit,
  maxAttempts = 3,
): Promise<InstanceResponse> {
  await checkInstances()

  const available = getAvailableInstances(kind)
  if (available.length === 0) {
    throw new Error(`Aucune instance ${kind} disponible`)
  }

  let lastError: Error | null = null
  const attempts = Math.min(maxAttempts, available.length)

  for (let i = 0; i < attempts; i++) {
    const instance = available[i]
    try {
      const res = await fetch(`${instance.apiUrl}${path}`, options)
      if (!res.ok) {
        penalizeInstance(instance.origin)
        lastError = new Error(`HTTP ${res.status} (${instance.origin})`)
        continue
      }
      const data = await res.json()
      if (data?.error) {
        // Erreur applicative : l'instance répond mais ne peut pas servir cette
        // ressource (playlist privée, vidéo bloquée). On la remonte telle quelle.
        penalizeInstance(instance.origin, 10_000)
        lastError = new Error(String(data.error))
        continue
      }
      boostInstance(instance.origin)
      return { data, instance }
    } catch (err) {
      penalizeInstance(instance.origin)
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error(`Toutes les instances ${kind} ont échoué`)
}

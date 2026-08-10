/**
 * Diagnostic des instances.
 *
 * Quand plus rien ne joue, la question utile n'est pas « quelle erreur ? » mais
 * « quelle instance peut encore diffuser du son ? ». Ce module répond aux deux,
 * séparément, parce que les deux capacités sont indépendantes :
 *
 *  - l'**API** est du JSON lu par fetch(), donc soumise au CORS. Elle sert la
 *    recherche et l'import ;
 *  - le **flux** est consommé par un élément <audio>, qui n'est pas soumis au
 *    CORS. Une instance peut parfaitement diffuser du son alors que son API
 *    nous refuse : c'est même le cas le plus fréquent aujourd'hui.
 */

import { getInstances } from './instances'
import type { Instance } from './instances'
import { audioUrlFor } from './invidious'
import { pickAudioStream } from './piped'
import { proxyVariants } from './corsProxy'

/**
 * Délai par tentative, volontairement plus court que celui de la lecture.
 *
 * Un diagnostic doit rendre un verdict vite : chaque capacité vaut jusqu'à deux
 * tentatives (direct puis relais), et il y a trois capacités par instance.
 */
const PROBE_TIMEOUT = 4000

/**
 * Un seul relais essayé lors du diagnostic, là où la lecture en essaie
 * plusieurs. En tester trois multipliait la durée par quatre pour une
 * information quasi identique : si le premier relais échoue, c'est presque
 * toujours l'instance qui est en cause, pas le relais.
 */
const DIAGNOSTIC_PROXY_ATTEMPTS = 1

/** Nombre d'instances testées, les mieux classées d'abord. */
const DEFAULT_MAX_INSTANCES = 10

/** Vidéo de référence, publique et stable, utilisée comme témoin. */
const PROBE_VIDEO_ID = 'dQw4w9WgXcQ'

/** Requête témoin : assez banale pour qu'une recherche saine renvoie forcément quelque chose. */
const PROBE_QUERY = 'music'

/** « proxy » : inaccessible en direct, mais joignable via un relais CORS. */
export type ProbeResult = 'ok' | 'proxy' | 'ko'

export interface InstanceDiagnostic {
  origin: string
  kind: Instance['kind']
  api: ProbeResult
  search: ProbeResult
  stream: ProbeResult
  detail: string
}

interface Probe {
  ok: boolean
  viaProxy: boolean
  detail: string
}

function verdict(probe: Probe): ProbeResult {
  if (!probe.ok) return 'ko'
  return probe.viaProxy ? 'proxy' : 'ok'
}

/**
 * Teste si une URL audio est réellement lisible.
 *
 * Passe par un élément <audio> et non par fetch() : c'est le chemin qu'emprunte
 * la lecture, et il ne dépend pas du CORS.
 *
 * L'élément est **fourni par l'appelant** et réutilisé pour toutes les
 * instances. Sur iOS, l'autorisation de charger un média est attachée à
 * l'élément et ne s'obtient que par un geste utilisateur : créer un nouvel
 * Audio par instance, comme le faisait la version précédente, garantissait un
 * échec sur téléphone quel que soit l'état réel des instances.
 */
function canPlay(audio: HTMLAudioElement, url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const onLoaded = () => finish(true)
    const onError = () => finish(false)

    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      audio.removeEventListener('loadedmetadata', onLoaded)
      audio.removeEventListener('canplay', onLoaded)
      audio.removeEventListener('error', onError)
      audio.removeAttribute('src')
      audio.load()
      resolve(ok)
    }

    const timer = setTimeout(() => finish(false), timeoutMs)
    audio.addEventListener('loadedmetadata', onLoaded)
    audio.addEventListener('canplay', onLoaded)
    audio.addEventListener('error', onError)

    audio.src = url
    audio.load()
  })
}

async function fetchJsonOnce(
  url: string,
  label: string,
  accept: (data: any) => boolean,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return { ok: false, detail: `${label} HTTP ${res.status}` }

    // Un corps non-JSON en 200 est la signature d'un dispositif anti-bot, que
    // la liste officielle impose désormais à toute instance publique : la
    // réponse est une page de défi, pas une panne.
    let data: any
    try {
      data = await res.json()
    } catch {
      return { ok: false, detail: `${label} : page de défi anti-bot` }
    }

    if (data?.error) return { ok: false, detail: `${label} : ${String(data.error)}` }
    if (!accept(data)) return { ok: false, detail: `${label} : réponse vide` }
    return { ok: true, detail: '' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // « Load failed » (WebKit) et « Failed to fetch » (Chromium) traduisent le
    // même refus : la réponse n'a pas d'en-tête CORS pour notre origine.
    const isCors = /load failed|failed to fetch|networkerror/i.test(message)
    return { ok: false, detail: isCors ? `${label} bloquée (CORS)` : `${label} : ${message}` }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Teste un appel JSON tel que l'application le fait réellement : direct, puis
 * relais CORS en secours.
 *
 * Sans cette seconde passe, le diagnostic annonçait « bloquée (CORS) » là où
 * l'application, elle, passait par le relais et fonctionnait — un verdict plus
 * pessimiste que la réalité, donc trompeur.
 */
async function probeJson(
  instance: Instance,
  path: string,
  label: string,
  accept: (data: any) => boolean = () => true,
): Promise<Probe> {
  const direct = await fetchJsonOnce(`${instance.apiUrl}${path}`, label, accept)
  if (direct.ok) return { ...direct, viaProxy: false }

  for (const { proxy, url } of proxyVariants(`${instance.apiUrl}${path}`).slice(0, DIAGNOSTIC_PROXY_ATTEMPTS)) {
    const relayed = await fetchJsonOnce(url, label, accept)
    if (relayed.ok) {
      return { ok: true, viaProxy: true, detail: `${label} via ${proxy.label}` }
    }
  }

  return { ...direct, viaProxy: false }
}

function probeApi(instance: Instance) {
  const path =
    instance.kind === 'invidious'
      ? `/videos/${PROBE_VIDEO_ID}`
      : `/streams/${PROBE_VIDEO_ID}`
  return probeJson(instance, path, 'API')
}

/**
 * Teste l'endpoint de recherche, séparément du reste de l'API.
 *
 * Beaucoup d'instances désactivent ou limitent la recherche, coûteuse et très
 * sollicitée, tout en servant normalement le reste. Un verdict « API ✓ » global
 * ne disait donc rien de la recherche — d'où des rapports « l'API fonctionne
 * mais la recherche non » parfaitement cohérents.
 */
function probeSearch(instance: Instance) {
  const path =
    instance.kind === 'invidious'
      ? `/search?q=${encodeURIComponent(PROBE_QUERY)}&type=video`
      : `/search?q=${encodeURIComponent(PROBE_QUERY)}&filter=music_songs`

  const accept = (data: any) =>
    instance.kind === 'invidious'
      ? Array.isArray(data) && data.length > 0
      : Array.isArray(data?.items) && data.items.length > 0

  return probeJson(instance, path, 'Recherche', accept)
}

async function probeStream(
  audio: HTMLAudioElement,
  instance: Instance,
  apiData: Probe,
): Promise<Probe> {
  if (instance.kind === 'invidious') {
    const url = audioUrlFor(instance.origin, PROBE_VIDEO_ID)

    if (await canPlay(audio, url, PROBE_TIMEOUT)) {
      return { ok: true, viaProxy: false, detail: '' }
    }

    // Un flux lu par <audio> n'est pas soumis au CORS : s'il échoue en direct,
    // c'est l'instance qui ne relaie plus rien. Le relais peut malgré tout
    // aboutir, en attaquant depuis une autre IP et sans en-tête Origin.
    for (const { proxy, url: relayed } of proxyVariants(url).slice(0, DIAGNOSTIC_PROXY_ATTEMPTS)) {
      if (await canPlay(audio, relayed, PROBE_TIMEOUT)) {
        return { ok: true, viaProxy: true, detail: `flux via ${proxy.label}` }
      }
    }

    return { ok: false, viaProxy: false, detail: 'flux injoignable' }
  }

  // Piped ne publie l'URL de son flux que via son API : si l'API est muette,
  // le flux est hors de portée, sans que cela dise quoi que ce soit du relais.
  if (!apiData.ok) return { ok: false, viaProxy: false, detail: 'flux non testable sans son API' }

  try {
    const res = await fetch(`${instance.apiUrl}/streams/${PROBE_VIDEO_ID}`)
    const data = await res.json()
    const stream = pickAudioStream(data?.audioStreams)
    if (!stream) return { ok: false, viaProxy: false, detail: 'aucun flux audio proposé' }

    if (await canPlay(audio, stream.url, PROBE_TIMEOUT)) {
      return { ok: true, viaProxy: false, detail: '' }
    }
    for (const { proxy, url: relayed } of proxyVariants(stream.url).slice(0, DIAGNOSTIC_PROXY_ATTEMPTS)) {
      if (await canPlay(audio, relayed, PROBE_TIMEOUT)) {
        return { ok: true, viaProxy: true, detail: `flux via ${proxy.label}` }
      }
    }
    return { ok: false, viaProxy: false, detail: 'flux injoignable' }
  } catch {
    return { ok: false, viaProxy: false, detail: 'flux injoignable' }
  }
}

/**
 * Teste toutes les instances.
 *
 * Les appels d'API partent en parallèle — ils ne se gênent pas. Les tests de
 * flux, eux, sont **séquentiels** : ils partagent l'unique élément audio
 * autorisé par le geste de l'utilisateur, et un élément média ne charge qu'une
 * source à la fois.
 *
 * `probeAudio` doit avoir été créé et déverrouillé dans le gestionnaire de clic
 * (voir services/audioUnlock.ts). Les résultats arrivent au fil de l'eau : sur
 * une dizaine d'instances lentes, attendre la fin donnerait l'impression d'une
 * application figée.
 */
export interface DiagnoseOptions {
  /** Interrompt le test entre deux instances. */
  signal?: AbortSignal
  /** Instances testées, les mieux classées d'abord. */
  maxInstances?: number
  /** Nombre total d'instances qui seront testées, connu avant le premier résultat. */
  onTotal?: (total: number) => void
}

/**
 * Teste les instances **une par une**, en publiant chaque verdict dès qu'il est
 * connu.
 *
 * La version précédente traitait toutes les instances en deux phases globales :
 * rien ne s'affichait tant que la phase JSON n'était pas terminée sur
 * l'ensemble des instances, soit plusieurs minutes de silence complet une fois
 * le repli par relais ajouté. Séquentiel et progressif vaut mieux ici : la
 * première ligne tombe en quelques secondes, et l'utilisateur peut arrêter.
 *
 * Les deux sondes JSON d'une même instance restent parallèles — elles ne se
 * gênent pas — tandis que la sonde de flux est nécessairement sérialisée : elle
 * partage l'unique élément audio autorisé par le geste de l'utilisateur.
 */
export async function diagnoseInstances(
  probeAudio: HTMLAudioElement,
  onResult: (result: InstanceDiagnostic) => void,
  options: DiagnoseOptions = {},
): Promise<void> {
  const queue = getInstances().slice(0, options.maxInstances ?? DEFAULT_MAX_INSTANCES)
  options.onTotal?.(queue.length)

  for (const instance of queue) {
    if (options.signal?.aborted) return

    const [api, search] = await Promise.all([
      probeApi(instance).catch(() => failed('API')),
      probeSearch(instance).catch(() => failed('Recherche')),
    ])

    if (options.signal?.aborted) return

    let stream: Probe
    try {
      stream = await probeStream(probeAudio, instance, api)
    } catch {
      stream = failed('Flux')
    }

    const notes = [api.detail, search.detail, stream.detail].filter(Boolean)
    const allOk = api.ok && search.ok && stream.ok
    onResult({
      origin: instance.origin,
      kind: instance.kind,
      api: verdict(api),
      search: verdict(search),
      stream: verdict(stream),
      detail: allOk ? 'tout fonctionne' : notes.join(' — ') || 'échec',
    })
  }
}

function failed(label: string): Probe {
  return { ok: false, viaProxy: false, detail: `${label} : échec inattendu` }
}

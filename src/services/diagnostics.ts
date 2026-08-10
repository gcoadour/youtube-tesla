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

import { getInstances, audioProbeTimeout } from './instances'
import type { Instance } from './instances'
import { audioUrlFor } from './invidious'

/** Vidéo de référence, publique et stable, utilisée comme témoin. */
const PROBE_VIDEO_ID = 'dQw4w9WgXcQ'

/** Requête témoin : assez banale pour qu'une recherche saine renvoie forcément quelque chose. */
const PROBE_QUERY = 'music'

export type ProbeResult = 'ok' | 'ko'

export interface InstanceDiagnostic {
  origin: string
  kind: Instance['kind']
  api: ProbeResult
  search: ProbeResult
  stream: ProbeResult
  detail: string
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

async function probeJson(
  instance: Instance,
  path: string,
  label: string,
  accept: (data: any) => boolean = () => true,
): Promise<{ ok: boolean; detail: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), audioProbeTimeout)
  try {
    const res = await fetch(`${instance.apiUrl}${path}`, { signal: controller.signal })
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
  apiData: { ok: boolean },
): Promise<{ ok: boolean; detail: string }> {
  if (instance.kind === 'invidious') {
    const ok = await canPlay(audio, audioUrlFor(instance.origin, PROBE_VIDEO_ID), audioProbeTimeout)
    return { ok, detail: ok ? '' : 'flux injoignable' }
  }

  // Piped ne publie l'URL de son flux que via son API : si l'API est muette,
  // le flux est hors de portée, sans que cela dise quoi que ce soit du relais.
  if (!apiData.ok) return { ok: false, detail: 'flux non testable sans son API' }

  try {
    const res = await fetch(`${instance.apiUrl}/streams/${PROBE_VIDEO_ID}`)
    const data = await res.json()
    const stream = (data?.audioStreams || [])
      .filter((s: any) => s.url)
      .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))[0]
    if (!stream) return { ok: false, detail: 'aucun flux audio proposé' }
    const ok = await canPlay(audio, stream.url, audioProbeTimeout)
    return { ok, detail: ok ? '' : 'flux injoignable' }
  } catch {
    return { ok: false, detail: 'flux injoignable' }
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
export async function diagnoseInstances(
  probeAudio: HTMLAudioElement,
  onResult: (result: InstanceDiagnostic) => void,
  apiConcurrency = 3,
): Promise<void> {
  const queue = getInstances()
  if (queue.length === 0) return

  const apiResults = new Map<string, { ok: boolean; detail: string }>()
  const searchResults = new Map<string, { ok: boolean; detail: string }>()
  let cursor = 0

  const apiWorker = async () => {
    while (cursor < queue.length) {
      const instance = queue[cursor++]
      const [api, search] = await Promise.all([
        probeApi(instance).catch(() => ({ ok: false, detail: 'API : échec inattendu' })),
        probeSearch(instance).catch(() => ({ ok: false, detail: 'Recherche : échec inattendu' })),
      ])
      apiResults.set(instance.origin, api)
      searchResults.set(instance.origin, search)
    }
  }

  await Promise.all(Array.from({ length: Math.min(apiConcurrency, queue.length) }, apiWorker))

  for (const instance of queue) {
    const api = apiResults.get(instance.origin) ?? { ok: false, detail: 'API : non testée' }
    const search = searchResults.get(instance.origin) ?? { ok: false, detail: '' }
    let stream: { ok: boolean; detail: string }
    try {
      stream = await probeStream(probeAudio, instance, api)
    } catch {
      stream = { ok: false, detail: 'flux : échec inattendu' }
    }

    const notes = [api.detail, search.detail, stream.detail].filter(Boolean)
    const allOk = api.ok && search.ok && stream.ok
    onResult({
      origin: instance.origin,
      kind: instance.kind,
      api: api.ok ? 'ok' : 'ko',
      search: search.ok ? 'ok' : 'ko',
      stream: stream.ok ? 'ok' : 'ko',
      detail: allOk ? 'tout fonctionne' : notes.join(' — ') || 'échec',
    })
  }
}

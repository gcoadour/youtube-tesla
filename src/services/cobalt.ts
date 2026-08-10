/**
 * Client Cobalt (https://github.com/imputnet/cobalt).
 *
 * Écrit d'après docs/api.md du dépôt officiel. Cobalt résout une URL YouTube en
 * un flux audio direct, servi par l'instance elle-même — donc avec CORS, et sans
 * dépendre des instances Invidious ou Piped publiques.
 *
 * **Instance fournie par l'utilisateur, jamais d'instance publique en dur.** La
 * documentation est explicite : les instances hébergées comme api.cobalt.tools
 * emploient une protection anti-bot et ne sont pas destinées à être utilisées
 * par d'autres projets sans autorisation. On ne s'y branche donc pas : il faut
 * héberger la sienne, ou obtenir l'accord d'un opérateur.
 *
 * Contrat utilisé :
 *   POST /
 *   en-têtes : Accept: application/json, Content-Type: application/json,
 *              Authorization: <schéma> <jeton> (facultatif)
 *   corps    : { url, downloadMode: 'audio', audioFormat, audioBitrate }
 *   réponse  : { status: 'tunnel' | 'redirect' | 'local-processing' | 'picker' | 'error', ... }
 */

const URL_KEY = 'yt-cobalt-url'
const KEY_KEY = 'yt-cobalt-key'

export interface CobaltConfig {
  /** Origine de l'instance, ex. https://cobalt.exemple.fr. Vide = désactivé. */
  url: string
  /** Jeton d'authentification, avec son schéma : « Api-Key … » ou « Bearer … ». */
  key: string
}

export function getCobaltConfig(): CobaltConfig {
  try {
    return {
      url: localStorage.getItem(URL_KEY) || '',
      key: localStorage.getItem(KEY_KEY) || '',
    }
  } catch {
    return { url: '', key: '' }
  }
}

export function setCobaltConfig(config: CobaltConfig): void {
  try {
    localStorage.setItem(URL_KEY, config.url.trim().replace(/\/+$/, ''))
    localStorage.setItem(KEY_KEY, config.key.trim())
  } catch {
    // Non persisté, mais actif pour la session.
  }
}

export function isCobaltConfigured(): boolean {
  return getCobaltConfig().url.length > 0
}

/**
 * Format audio demandé.
 *
 * `best` conserve le codec d'origine, donc le plus souvent de l'Opus — que
 * Safari ne décode pas. Sur un moteur qui ne sait pas lire l'Opus, on demande
 * explicitement du MP3 : Cobalt transcode, c'est plus lent, mais c'est audible.
 */
function preferredAudioFormat(): 'best' | 'mp3' {
  const probe = document.createElement('audio')
  const opus =
    probe.canPlayType('audio/webm; codecs="opus"') ||
    probe.canPlayType('audio/ogg; codecs="opus"')
  return opus ? 'best' : 'mp3'
}

function authHeader(key: string): Record<string, string> {
  if (!key) return {}
  // Le jeton est fourni avec son schéma ; à défaut on suppose Api-Key.
  return { Authorization: /^(Api-Key|Bearer)\s/i.test(key) ? key : `Api-Key ${key}` }
}

/** Messages des codes d'erreur les plus courants, pour ne pas afficher un code brut. */
function describeError(code: string): string {
  if (code.startsWith('api.auth')) return "l'instance Cobalt exige une authentification"
  if (code.includes('rate_exceeded')) return 'quota de requêtes dépassé sur cette instance Cobalt'
  if (code.includes('content.too_long')) return 'piste trop longue pour cette instance Cobalt'
  if (code.includes('fetch.fail') || code.includes('content.video.unavailable')) {
    return 'Cobalt n\'a pas pu récupérer cette piste'
  }
  return `Cobalt : ${code}`
}

export interface CobaltStream {
  url: string
  origin: string
}

export async function getAudioStreamUrl(videoId: string): Promise<CobaltStream> {
  const { url: origin, key } = getCobaltConfig()
  if (!origin) throw new Error('aucune instance Cobalt configurée')

  const res = await fetch(origin, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...authHeader(key),
    },
    body: JSON.stringify({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      downloadMode: 'audio',
      audioFormat: preferredAudioFormat(),
      // On ne sait pas remuxer côté navigateur : il faut un flux prêt à lire.
      localProcessing: 'disabled',
      disableMetadata: true,
    }),
  })

  const data = await res.json().catch(() => null)

  if (!data) throw new Error(`Cobalt : réponse illisible (HTTP ${res.status})`)
  if (data.status === 'error') throw new Error(describeError(String(data.error?.code ?? 'inconnu')))
  if (data.status === 'tunnel' || data.status === 'redirect') {
    return { url: data.url, origin }
  }
  if (data.status === 'local-processing') {
    // Un seul tunnel signifie un flux déjà exploitable ; au-delà il faudrait
    // fusionner des pistes, ce que le navigateur ne fera pas.
    const tunnels: string[] = data.tunnel || []
    if (tunnels.length === 1) return { url: tunnels[0], origin }
    throw new Error('Cobalt : ce flux demande un assemblage local, impossible ici')
  }

  throw new Error(`Cobalt : réponse inattendue (${data.status})`)
}

/**
 * Résolution de l'URL audio d'une vidéo, avec repli instance par instance.
 *
 * Ordre : proxy de développement (yt-dlp) → instances Invidious → instances
 * Piped. En production seules les deux dernières existent : le proxy Vite n'est
 * pas déployé sur GitHub Pages.
 */

import { getAudioStreamUrl as getInvidiousUrl, audioUrlFor } from './invidious'
import { getAudioStreamUrl as getPipedUrl } from './piped'
import { getAvailableInstances } from './instances'
import { proxyVariants, proxyOrigin } from './corsProxy'

/**
 * Le proxy yt-dlp n'existe que dans le serveur de développement Vite.
 *
 * Ce test portait sur le nom d'hôte (« localhost »), ce qui faisait aussi
 * emprunter ce chemin à la construction de production servie en local
 * (`vite preview`) : l'URL /api/yt-audio/ répondait alors 404 et masquait le
 * comportement réellement déployé. Le mode de build est le seul critère juste.
 */
function isDev(): boolean {
  return import.meta.env.DEV
}

/** Origine fictive du proxy de développement, pour l'exclure comme les autres. */
export const DEV_PROXY_ORIGIN = 'dev-proxy'

export interface ResolvedStream {
  url: string
  source: 'dev-proxy' | 'invidious' | 'piped' | 'proxy'
  /** Origine de l'instance ayant fourni l'URL, à exclure si le flux échoue. */
  origin: string
}

/**
 * Renvoie la première URL de flux exploitable.
 *
 * `tried` contient les origines déjà écartées pour cette piste : une instance
 * dont le flux vient d'échouer y est ajoutée par l'appelant, si bien que des
 * appels successifs parcourent toutes les instances Invidious puis toutes les
 * instances Piped avant d'abandonner.
 */
export async function resolveStream(
  videoId: string,
  tried: Iterable<string> = [],
): Promise<ResolvedStream> {
  const excluded = new Set(tried)
  const errors: string[] = []

  if (isDev() && !excluded.has(DEV_PROXY_ORIGIN)) {
    return { url: `/api/yt-audio/${videoId}`, source: 'dev-proxy', origin: DEV_PROXY_ORIGIN }
  }

  try {
    const { url, origin } = await getInvidiousUrl(videoId, excluded)
    return { url, source: 'invidious', origin }
  } catch (err) {
    errors.push(`Invidious : ${err instanceof Error ? err.message : String(err)}`)
  }

  try {
    const { url, origin } = await getPipedUrl(videoId, excluded)
    return { url, source: 'piped', origin }
  } catch (err) {
    errors.push(`Piped : ${err instanceof Error ? err.message : String(err)}`)
  }

  /*
   * Dernier recours : le flux relayé par un proxy CORS public.
   *
   * Un <audio> n'est pas soumis au CORS, donc ce détour ne sert pas à contourner
   * le CORS mais le **dispositif anti-bot** : la requête part du serveur relais,
   * avec une autre adresse IP et sans en-tête Origin. Limites à connaître — ces
   * relais gèrent mal les requêtes Range, donc le déplacement dans la piste peut
   * être approximatif, et leur débit est bridé.
   */
  for (const instance of getAvailableInstances('invidious')) {
    for (const { proxy, url } of proxyVariants(audioUrlFor(instance.origin, videoId))) {
      const origin = proxyOrigin(proxy.id, instance.origin)
      if (excluded.has(origin)) continue
      return { url, source: 'proxy', origin }
    }
  }

  throw new Error(
    errors.length > 0
      ? `Aucune source audio disponible (${errors.join(' — ')})`
      : 'Aucune source audio disponible',
  )
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  return (await resolveStream(videoId)).url
}

/**
 * Télécharge la piste entière pour le cache hors ligne.
 * Réservé au téléchargement explicite : la lecture, elle, streame.
 *
 * Comme pour la lecture, un échec fait passer à l'instance suivante.
 */
export async function getAudioBlob(videoId: string): Promise<Blob> {
  const tried = new Set<string>()
  let lastError: Error | null = null

  // Bornage large : la boucle s'arrête d'elle-même quand resolveStream n'a plus
  // d'instance à proposer.
  for (let attempt = 0; attempt < 12; attempt++) {
    let stream: ResolvedStream
    try {
      stream = await resolveStream(videoId, tried)
    } catch (err) {
      throw lastError ?? (err instanceof Error ? err : new Error(String(err)))
    }

    tried.add(stream.origin)
    try {
      const response = await fetch(stream.url)
      if (response.ok) return await response.blob()
      lastError = new Error(`${response.status} ${response.statusText} (${stream.origin})`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError ?? new Error('Téléchargement impossible')
}

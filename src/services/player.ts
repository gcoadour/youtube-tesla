/**
 * Résolution de l'URL audio d'une vidéo, avec repli entre sources.
 *
 * Ordre : proxy de développement (yt-dlp) → Invidious relayé → Piped.
 * En production seuls les deux derniers existent : le proxy Vite n'est pas
 * déployé sur GitHub Pages.
 */

import { getAudioStreamUrl as getInvidiousUrl } from './invidious'
import { getAudioStreamUrl as getPipedUrl } from './piped'

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

export interface ResolvedStream {
  url: string
  source: 'dev-proxy' | 'invidious' | 'piped'
}

/**
 * `exclude` permet de redemander une URL en sautant une source qui vient
 * d'échouer — utilisé quand l'élément <audio> rejette le flux.
 */
export async function resolveStream(
  videoId: string,
  exclude: ResolvedStream['source'][] = [],
): Promise<ResolvedStream> {
  const errors: string[] = []

  if (isDev() && !exclude.includes('dev-proxy')) {
    return { url: `/api/yt-audio/${videoId}`, source: 'dev-proxy' }
  }

  if (!exclude.includes('invidious')) {
    try {
      return { url: await getInvidiousUrl(videoId), source: 'invidious' }
    } catch (err) {
      errors.push(`Invidious : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  if (!exclude.includes('piped')) {
    try {
      return { url: await getPipedUrl(videoId), source: 'piped' }
    } catch (err) {
      errors.push(`Piped : ${err instanceof Error ? err.message : String(err)}`)
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
 */
export async function getAudioBlob(videoId: string): Promise<Blob> {
  const { url } = await resolveStream(videoId)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Téléchargement impossible : ${response.status} ${response.statusText}`)
  }
  return response.blob()
}

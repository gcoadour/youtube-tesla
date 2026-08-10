/**
 * Client Piped — seconde famille d'API, utilisée en repli d'Invidious.
 *
 * Deux avantages sur Invidious pour ce projet :
 *  - un filtre de recherche « music_songs » qui évite le filtrage heuristique côté client ;
 *  - des URLs de flux audio déjà relayées par le proxy Piped, donc avec CORS et Range,
 *    directement exploitables par un <audio> et par fetch() pour la mise en cache.
 */

import { fetchFromInstances } from './instances'
import type { Track } from '../types'

/** Extrait l'identifiant vidéo d'une URL Piped ("/watch?v=ID"). */
function videoIdFromUrl(url: string): string {
  const m = (url || '').match(/[?&]v=([\w-]{11})/)
  return m ? m[1] : ''
}

function toTrack(item: any): Track | null {
  const videoId = item.url ? videoIdFromUrl(item.url) : item.id || ''
  if (!videoId) return null
  return {
    id: videoId,
    videoId,
    title: item.title || 'Sans titre',
    artist: item.uploaderName || item.uploader || 'Artiste inconnu',
    thumbnail: item.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    duration: typeof item.duration === 'number' && item.duration > 0 ? item.duration : 0,
  }
}

export async function searchMusic(query: string): Promise<Track[]> {
  const { data } = await fetchFromInstances(
    'piped',
    `/search?q=${encodeURIComponent(query)}&filter=music_songs`,
    // Même raison que côté Invidious : un 200 vide ne doit pas clore la cascade.
    { accept: (d) => Array.isArray(d?.items) && d.items.length > 0 },
  )
  const items: any[] = data?.items || []
  return items.map(toTrack).filter((t): t is Track => t !== null)
}

export interface PipedPlaylist {
  title: string
  description: string
  thumbnail: string
  tracks: Track[]
}

/**
 * Récupère une playlist complète en suivant les curseurs `nextpage`.
 * `maxPages` borne la boucle pour ne pas marteler l'instance sur une playlist géante.
 */
export async function getPlaylist(playlistId: string, maxPages = 20): Promise<PipedPlaylist> {
  const { data, instance } = await fetchFromInstances(
    'piped',
    `/playlists/${encodeURIComponent(playlistId)}`,
  )

  const tracks: Track[] = []
  // Même précaution que côté Invidious : un curseur `nextpage` qui ne progresse
  // pas ferait boucler la pagination sur les mêmes titres.
  const seen = new Set<string>()

  const appendPage = (items: any[]): number => {
    let added = 0
    for (const item of items) {
      const track = toTrack(item)
      if (!track || seen.has(track.videoId)) continue
      seen.add(track.videoId)
      tracks.push(track)
      added++
    }
    return added
  }

  appendPage(data?.relatedStreams || [])

  let nextpage: string | null = data?.nextpage ?? null
  let pages = 1

  // La pagination doit rester sur l'instance qui a servi la première page :
  // le curseur `nextpage` n'est pas transposable d'une instance à l'autre.
  while (nextpage && pages < maxPages) {
    try {
      const res = await fetch(
        `${instance.apiUrl}/nextpage/playlists/${encodeURIComponent(playlistId)}?nextpage=${encodeURIComponent(nextpage)}`,
      )
      if (!res.ok) break
      const page = await res.json()
      if (appendPage(page?.relatedStreams || []) === 0) break
      nextpage = page?.nextpage ?? null
      pages++
    } catch {
      break
    }
  }

  return {
    title: data?.name || 'Playlist sans titre',
    description: data?.description || '',
    thumbnail: data?.thumbnailUrl || tracks[0]?.thumbnail || '',
    tracks,
  }
}

/**
 * URL du meilleur flux audio. Déjà relayée par le proxy Piped : CORS et Range présents.
 *
 * `exclude` porte les origines dont le flux a déjà échoué pour cette piste.
 */
export async function getAudioStreamUrl(
  videoId: string,
  exclude: Iterable<string> = [],
): Promise<{ url: string; origin: string }> {
  const { data, instance } = await fetchFromInstances(
    'piped',
    `/streams/${encodeURIComponent(videoId)}`,
    { exclude },
  )

  const audioStreams: any[] = (data?.audioStreams || [])
    .filter((s: any) => s.url)
    .sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0))

  if (audioStreams.length === 0) {
    throw new Error('Aucun flux audio disponible via Piped')
  }
  return { url: audioStreams[0].url, origin: instance.origin }
}

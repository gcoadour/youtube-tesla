/**
 * Client Invidious. La découverte d'instances vit désormais dans instances.ts ;
 * ce module ne s'occupe plus que des endpoints.
 */

import { fetchFromInstances } from './instances'
import type { Track } from '../types'

/** Nombre de vidéos renvoyées par page par l'API playlists d'Invidious. */
const PLAYLIST_PAGE_SIZE = 100

export interface InvidiousSearchItem {
  videoId: string
  title: string
  author: string
  lengthSeconds: number
}

function toTrack(v: any): Track | null {
  if (!v?.videoId) return null
  return {
    id: v.videoId,
    videoId: v.videoId,
    title: v.title || 'Sans titre',
    artist: v.author || 'Artiste inconnu',
    thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
    duration: typeof v.lengthSeconds === 'number' ? v.lengthSeconds : 0,
  }
}

export async function searchVideos(query: string): Promise<InvidiousSearchItem[]> {
  const { data } = await fetchFromInstances(
    'invidious',
    `/search?q=${encodeURIComponent(query)}&type=video`,
  )
  return Array.isArray(data) ? data : []
}

export interface InvidiousPlaylist {
  title: string
  description: string
  thumbnail: string
  tracks: Track[]
}

/**
 * Récupère une playlist en suivant les pages tant qu'elles sont pleines.
 * Sans cela les playlists sont tronquées aux 100 premiers titres.
 */
export async function getPlaylist(playlistId: string, maxPages = 20): Promise<InvidiousPlaylist> {
  const first = await fetchFromInstances(
    'invidious',
    `/playlists/${encodeURIComponent(playlistId)}`,
  )

  const data = first.data
  const tracks: Track[] = []
  // Certaines instances ignorent `?page=` et renvoient toujours la première
  // page : sans dédoublonnage, la boucle empilerait 20 fois la même playlist.
  const seen = new Set<string>()

  const appendPage = (videos: any[]): number => {
    let added = 0
    for (const v of videos) {
      const track = toTrack(v)
      if (!track || seen.has(track.videoId)) continue
      seen.add(track.videoId)
      tracks.push(track)
      added++
    }
    return added
  }

  let lastCount = appendPage(data?.videos || [])
  let page = 1

  // On reste sur l'instance qui a répondu : changer d'instance en cours de
  // pagination donnerait un ordre incohérent.
  while (lastCount >= PLAYLIST_PAGE_SIZE && page < maxPages) {
    page++
    const pagePath = `/playlists/${encodeURIComponent(playlistId)}?page=${page}`

    let videos: any[] | null = null
    try {
      const res = await fetch(`${first.instance.apiUrl}${pagePath}`)
      if (res.ok) videos = (await res.json())?.videos || []
    } catch {
      videos = null
    }

    // L'instance qui a servi la première page a lâché : `?page=` est sans état
    // côté Invidious, la suite peut donc venir d'une autre instance. Le
    // dédoublonnage absorbe le recouvrement éventuel.
    if (videos === null) {
      try {
        videos = (await fetchFromInstances('invidious', pagePath)).data?.videos || []
      } catch {
        break
      }
    }

    const added = appendPage(videos || [])
    if (added === 0) break
    lastCount = added
  }

  return {
    title: data?.title || 'Playlist sans titre',
    description: data?.description || '',
    thumbnail: data?.thumbnailUrl || tracks[0]?.thumbnail || '',
    tracks,
  }
}

export interface InvidiousChannel {
  channelId: string
  name: string
  thumbnail: string
}

export async function getChannel(channelId: string): Promise<InvidiousChannel> {
  const { data } = await fetchFromInstances('invidious', `/channels/${encodeURIComponent(channelId)}`)
  return {
    channelId,
    name: data?.author || 'Chaîne inconnue',
    thumbnail: data?.authorThumbnails?.[data.authorThumbnails.length - 1]?.url || '',
  }
}

export async function searchChannel(query: string): Promise<InvidiousChannel | null> {
  const { data } = await fetchFromInstances(
    'invidious',
    `/search?q=${encodeURIComponent(query)}&type=channel`,
  )
  const channel = Array.isArray(data) ? data[0] : null
  if (!channel?.authorId) return null
  return {
    channelId: channel.authorId,
    name: channel.author || 'Chaîne inconnue',
    thumbnail: channel.authorThumbnails?.[channel.authorThumbnails.length - 1]?.url || '',
  }
}

export async function getChannelPlaylistIds(
  channelId: string,
): Promise<{ id: string; title: string }[]> {
  const ids: { id: string; title: string }[] = []
  let continuation: string | undefined
  let guard = 0

  do {
    let path = `/channels/${encodeURIComponent(channelId)}/playlists?sort=oldest`
    if (continuation) path += `&continuation=${encodeURIComponent(continuation)}`
    const { data } = await fetchFromInstances('invidious', path)

    const items: any[] = Array.isArray(data)
      ? data
      : Array.isArray(data?.playlists)
        ? data.playlists
        : []

    for (const item of items) {
      const pid = item.playlistId || item.id
      // LL = « Vidéos likées », inaccessible sans compte.
      if (pid && !pid.startsWith('LL')) {
        ids.push({ id: pid, title: item.title || 'Playlist sans titre' })
      }
    }

    continuation = data?.continuation
    guard++
  } while (continuation && guard < 10)

  return ids
}

/**
 * URL du flux audio relayée par l'instance (`local=true`).
 *
 * C'est le point clé de la lecture en production : l'URL googlevideo brute
 * renvoyée par `adaptiveFormats` n'a aucun en-tête CORS, donc ni <audio> fiable
 * ni fetch() possible depuis GitHub Pages. `latest_version` fait relayer le flux
 * par l'instance, qui répond avec CORS et gère les requêtes Range.
 *
 * itag 140 = AAC 128 kb/s, le format audio le plus universellement présent.
 *
 * `exclude` porte les origines dont le flux a déjà échoué pour cette piste :
 * l'appelant peut ainsi parcourir les instances une à une.
 */
export async function getAudioStreamUrl(
  videoId: string,
  exclude: Iterable<string> = [],
): Promise<{ url: string; origin: string }> {
  // On vérifie que la vidéo est lisible avant de renvoyer une URL de flux :
  // cela évite de coller au <audio> une URL qui répondra 403.
  const { instance } = await fetchFromInstances(
    'invidious',
    `/videos/${encodeURIComponent(videoId)}`,
    { exclude },
  )

  return {
    url: `${instance.origin}/latest_version?id=${encodeURIComponent(videoId)}&itag=140&local=true`,
    origin: instance.origin,
  }
}

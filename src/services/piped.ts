/**
 * Client Piped — seconde famille d'API, utilisée en repli d'Invidious.
 *
 * Écrit d'après la spécification OpenAPI officielle
 * (TeamPiped/OpenAPI, swagger.yaml), référencée par
 * https://docs.piped.video/docs/api-documentation/ :
 *
 *  - `GET /search?q=&filter=` — `filter` est **obligatoire** ; valeurs utiles ici :
 *    music_songs, music_videos, videos. Réponse : SearchPage { corrected, items[] },
 *    où items mêle StreamItem, ChannelItem et PlaylistItem, distingués par `type`.
 *  - `GET /streams/{videoId}` — VideoInfo, dont `audioStreams: Stream[]`.
 *    Stream porte url, format, mimeType, codec, bitrate, quality, itag, videoOnly.
 *
 * Deux avantages sur Invidious pour ce projet :
 *  - le filtre « music_songs » évite le filtrage heuristique côté client ;
 *  - les URLs de flux sont déjà relayées par le proxy Piped, donc avec CORS et
 *    Range, exploitables par un <audio> comme par fetch() pour la mise en cache.
 */

import { fetchFromInstances } from './instances'
import type { Track } from '../types'

/** Extrait l'identifiant vidéo d'une URL Piped ("/watch?v=ID"). */
function videoIdFromUrl(url: string): string {
  const m = (url || '').match(/[?&]v=([\w-]{11})/)
  return m ? m[1] : ''
}

/**
 * Une page de résultats mêle vidéos, chaînes et playlists : la spec les
 * distingue par `type` (« stream », « channel », « playlist »). Seules les
 * vidéos nous intéressent.
 */
function isStreamItem(item: any): boolean {
  return item?.type === undefined || item.type === 'stream'
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
  return items
    .filter(isStreamItem)
    .map(toTrack)
    .filter((t): t is Track => t !== null)
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
 * Le navigateur sait-il décoder ce flux ?
 *
 * Déterminant, et longtemps ignoré ici : YouTube sert la plupart de ses pistes
 * audio en Opus/WebM, que Safari — donc tout navigateur sur iPhone et iPad — ne
 * décode pas. Trier les flux par seul débit revenait à choisir presque toujours
 * un WEBMA_OPUS, injouable sur iOS, alors qu'un M4A/AAC parfaitement lisible
 * figurait dans la même réponse.
 */
function canDecode(stream: any): boolean {
  const probe = document.createElement('audio')
  const mime: string | undefined = stream?.mimeType
  const codec: string | undefined = stream?.codec

  if (mime) {
    const type = codec ? `${mime}; codecs="${codec}"` : mime
    const verdict = probe.canPlayType(type)
    if (verdict) return true
    // canPlayType('') vaut « non » ; on retente sans le codec, certains
    // navigateurs refusant une chaîne de codec qu'ils ne connaissent pas.
    if (codec && probe.canPlayType(mime)) return true
    return false
  }

  // Sans mimeType, on se rabat sur le champ `format` de la spec.
  const byFormat: Record<string, string> = {
    M4A: 'audio/mp4; codecs="mp4a.40.2"',
    MPEG_4: 'audio/mp4; codecs="mp4a.40.2"',
    MP3: 'audio/mpeg',
    WEBMA: 'audio/webm; codecs="vorbis"',
    WEBMA_OPUS: 'audio/webm; codecs="opus"',
    OPUS: 'audio/ogg; codecs="opus"',
    OGG: 'audio/ogg',
  }
  const guess = byFormat[String(stream?.format)]
  return guess ? !!probe.canPlayType(guess) : true
}

/**
 * Meilleur flux audio décodable par ce navigateur, au plus haut débit.
 * `audioStreams` est censé ne contenir que de l'audio, mais la spec autorise
 * `videoOnly` sur tout Stream : on l'écarte explicitement.
 */
export function pickAudioStream(streams: any[]): any | null {
  const usable = (streams || []).filter((s) => s?.url && s.videoOnly !== true)
  if (usable.length === 0) return null

  const byBitrate = [...usable].sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))
  const decodable = byBitrate.filter(canDecode)

  // Si aucun flux n'est annoncé décodable, on tente quand même le meilleur :
  // canPlayType est notoirement prudent et répond souvent « maybe » ou vide.
  return decodable[0] ?? byBitrate[0]
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

  const stream = pickAudioStream(data?.audioStreams)
  if (!stream) {
    throw new Error('aucun flux audio proposé')
  }
  return { url: stream.url, origin: instance.origin }
}

/**
 * Orchestration des sources : recherche, import de playlist, import de chaîne.
 * Chaque opération tente Invidious puis Piped, et remonte une erreur explicite
 * plutôt qu'un message générique quand tout échoue.
 */

import type { YouTubeSearchResult, Playlist, Track } from '../types'
import * as invidious from './invidious'
import * as piped from './piped'
import { checkInstances } from './instances'

checkInstances().catch(() => {})

const RSS_FEED = 'https://www.youtube.com/feeds/videos.xml'

/** Le flux RSS d'une playlist ne renvoie que les entrées les plus récentes. */
export const RSS_LIMIT = 15

const NON_MUSIC_KEYWORDS = [
  'tutorial', 'guide', 'how to', 'review', 'unboxing',
  'gameplay', 'walkthrough', 'let\'s play',
  'news', 'report', 'update',
  'podcast', 'episode',
  'lecture', 'course', 'lesson',
  'trailer', 'teaser',
  'vlog', 'daily',
  'cooking', 'recipe',
  'sport', 'match', 'highlight',
  'behind the scenes', 'making of', 'interview',
  'reaction', 'commentary', 'documentary',
]

/**
 * Heuristique musicale — appliquée UNIQUEMENT aux résultats de recherche.
 *
 * Elle ne doit jamais filtrer une playlist importée : ce que l'utilisateur a mis
 * dans sa playlist est par définition ce qu'il veut écouter. C'est ce filtrage
 * qui vidait les imports RSS (durée absente => `mins = 0` => tout était rejeté).
 */
function isMusicContent(item: { title?: string; author?: string; artist?: string; lengthSeconds?: number; duration?: number }): boolean {
  const title = (item.title || '').toLowerCase()
  const author = (item.author || item.artist || '').toLowerCase()
  const seconds = item.lengthSeconds ?? item.duration ?? 0

  // Durée inconnue (0) : on ne peut rien en conclure, on garde la piste.
  if (seconds > 0) {
    const mins = seconds / 60
    if (mins < 0.5 || mins > 20) return false
  }

  const isMusicChannel = ['vevo', 'music', 'records', 'official', 'topic'].some(k => author.includes(k))
  const hasMusicTitle = ['official video', 'official audio', 'official music', 'lyrics', 'lyric video', 'feat.', 'ft.', 'remix', 'clip', 'concert', 'live', 'acoustic', 'cover', 'instrumental', 'karaoke', 'session', 'performance'].some(k => title.includes(k))

  if (isMusicChannel || hasMusicTitle) return true

  return !NON_MUSIC_KEYWORDS.some(k => title.includes(k))
}

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// --- Recherche -------------------------------------------------------------

export async function searchTracks(query: string): Promise<YouTubeSearchResult[]> {
  const errors: string[] = []

  try {
    const items = await invidious.searchVideos(query)
    const results = items
      .filter(isMusicContent)
      .map((item) => ({
        videoId: item.videoId,
        title: item.title,
        artist: item.author,
        thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
        duration: item.lengthSeconds || 0,
      }))
    if (results.length > 0) return results
  } catch (err) {
    errors.push(errorMessage(err))
  }

  try {
    // Le filtre « music_songs » de Piped est déjà restreint à la musique :
    // pas d'heuristique à appliquer derrière.
    const tracks = await piped.searchMusic(query)
    if (tracks.length > 0) {
      return tracks.map((t) => ({
        videoId: t.videoId,
        title: t.title,
        artist: t.artist,
        thumbnail: t.thumbnail,
        duration: t.duration,
      }))
    }
  } catch (err) {
    errors.push(errorMessage(err))
  }

  if (errors.length > 0) {
    throw new Error(`Recherche indisponible (${errors.join(' — ')})`)
  }
  return []
}

// --- Identifiants ----------------------------------------------------------

export function parsePlaylistId(input: string): string | null {
  const patterns = [
    /[&?]list=([^&]+)/,
    /youtube\.com\/playlist\?list=([^&]+)/,
    /^([A-Za-z0-9_-]{13,})$/,
  ]
  for (const p of patterns) {
    const m = input.match(p)
    if (m) return m[1]
  }
  return null
}

/**
 * Playlists impossibles à récupérer sans être connecté à un compte Google.
 * Les détecter permet d'expliquer l'échec au lieu d'afficher « import échoué ».
 */
export function playlistRequiresAccount(playlistId: string): string | null {
  if (playlistId === 'LM') return 'Les titres likés (LM) ne sont accessibles qu\'avec un compte YouTube connecté.'
  if (playlistId === 'WL') return 'La liste « À regarder plus tard » (WL) nécessite un compte YouTube connecté.'
  if (playlistId.startsWith('LL')) return 'Les vidéos likées (LL) ne sont accessibles qu\'avec un compte YouTube connecté.'
  if (playlistId.startsWith('RD')) return 'Les mix YouTube (RD…) sont générés à la volée et ne peuvent pas être importés.'
  return null
}

// --- Import de playlist ----------------------------------------------------

export interface PlaylistImport {
  playlist: Playlist
  /** Renseigné quand seul le repli RSS a fonctionné : import forcément partiel. */
  warning?: string
}

export async function importPlaylist(playlistId: string): Promise<PlaylistImport> {
  const accountError = playlistRequiresAccount(playlistId)
  if (accountError) throw new Error(accountError)

  const errors: string[] = []

  try {
    const pl = await invidious.getPlaylist(playlistId)
    if (pl.tracks.length > 0) {
      return { playlist: { id: playlistId, source: 'youtube', ...pl } }
    }
    errors.push('Invidious : playlist vide')
  } catch (err) {
    errors.push(`Invidious : ${errorMessage(err)}`)
  }

  try {
    const pl = await piped.getPlaylist(playlistId)
    if (pl.tracks.length > 0) {
      return { playlist: { id: playlistId, source: 'youtube', ...pl } }
    }
    errors.push('Piped : playlist vide')
  } catch (err) {
    errors.push(`Piped : ${errorMessage(err)}`)
  }

  try {
    const playlist = await fetchPlaylistRss(playlistId)
    if (playlist.tracks.length > 0) {
      return {
        playlist,
        warning: `Import partiel : seul le flux RSS a répondu, limité aux ${RSS_LIMIT} titres les plus récents.`,
      }
    }
  } catch (err) {
    errors.push(`RSS : ${errorMessage(err)}`)
  }

  throw new Error(`Import impossible (${errors.join(' — ')})`)
}

/** Conservé pour les rafraîchissements internes qui n'ont pas besoin de l'avertissement. */
export async function fetchPlaylistById(playlistId: string): Promise<Playlist> {
  return (await importPlaylist(playlistId)).playlist
}

async function fetchPlaylistRss(playlistId: string): Promise<Playlist> {
  const res = await fetch(`${RSS_FEED}?playlist_id=${encodeURIComponent(playlistId)}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return parseRssPlaylist(await res.text(), playlistId)
}

function parseRssPlaylist(xml: string, playlistId: string): Playlist {
  const title = extractXmlTag(xml, 'title') || 'Playlist sans titre'
  const entries = xml.split('<entry>').slice(1)

  // Aucun filtrage musical ici : le RSS ne fournit pas de durée, et une playlist
  // importée doit arriver telle quelle.
  const tracks: Track[] = entries
    .map((entry) => {
      const videoId = extractXmlTag(entry, 'yt:videoId') || ''
      const mediaContent = entry.match(/<media:content[^>]*>/)
      const durationMatch = mediaContent?.[0].match(/duration="(\d+)"/)
      return {
        id: videoId,
        videoId,
        title: extractXmlTag(entry, 'title') || 'Sans titre',
        artist: extractXmlTag(entry, 'name') || 'Artiste inconnu',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: durationMatch ? parseInt(durationMatch[1]) : 0,
      }
    })
    .filter((t) => t.videoId)

  return {
    id: playlistId,
    title,
    description: '',
    thumbnail: tracks[0]?.thumbnail || '',
    tracks,
    source: 'youtube',
  }
}

function extractXmlTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`))
  return match ? match[1].trim() : ''
}

// --- Import de chaîne ------------------------------------------------------

export interface ChannelInfo {
  channelId: string
  name: string
  thumbnail: string
}

function extractChannelId(input: string): string | null {
  const urlMatch = input.match(/youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{13,})/)
  if (urlMatch) return urlMatch[1]
  const rawMatch = input.match(/^(UC[a-zA-Z0-9_-]{13,})$/)
  if (rawMatch) return rawMatch[1]
  return null
}

export async function resolveChannel(input: string): Promise<ChannelInfo | null> {
  const direct = extractChannelId(input)
  if (direct) {
    try {
      return await invidious.getChannel(direct)
    } catch {
      // On retombe sur la recherche par nom.
    }
  }

  const searchQuery = input.replace(/^@/, '').replace(/youtube\.com\/@?/, '')
  try {
    return await invidious.searchChannel(searchQuery)
  } catch {
    return null
  }
}

/**
 * Exécute `task` sur chaque entrée avec au plus `limit` requêtes simultanées.
 *
 * Sans cette borne, l'import d'une chaîne lançait toutes les playlists d'un coup :
 * l'instance rate-limitait, se faisait pénaliser, et la plupart des imports
 * échouaient alors qu'ils auraient réussi en série.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0

  const worker = async (): Promise<void> => {
    while (cursor < items.length) {
      const index = cursor++
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export async function fetchChannelPlaylists(
  channelId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Playlist[]> {
  const ids = await invidious.getChannelPlaylistIds(channelId)
  if (ids.length === 0) return []

  let done = 0
  onProgress?.(0, ids.length)

  const results = await mapWithConcurrency(ids, 3, async (entry) => {
    try {
      return await fetchPlaylistById(entry.id)
    } finally {
      done++
      onProgress?.(done, ids.length)
    }
  })

  // Une playlist qui a échoué est conservée en coquille vide, avec son titre :
  // la bibliothèque propose ensuite un bouton « Actualiser » pour la compléter.
  return results.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          id: ids[i].id,
          title: ids[i].title,
          description: '',
          thumbnail: '',
          tracks: [],
          source: 'youtube' as const,
        },
  )
}

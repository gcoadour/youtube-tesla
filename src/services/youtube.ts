import type { YouTubeSearchResult, Playlist, Track } from '../types'

const CORS_INSTANCE = 'https://inv.thepixora.com/api/v1'

const INSTANCES = [
  CORS_INSTANCE,
  'https://inv.nadeko.net/api/v1',
  'https://yt.artemislena.eu/api/v1',
  'https://invidious.private.coffee/api/v1',
  'https://invidious.nerdvpn.de/api/v1',
]

const RSS_FEED = 'https://www.youtube.com/feeds/videos.xml'

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
]

function isMusicContent(item: { title?: string; author?: string; artist?: string; lengthSeconds?: number; duration?: number }): boolean {
  const title = (item.title || '').toLowerCase()
  const author = (item.author || item.artist || '').toLowerCase()
  const mins = ((item.lengthSeconds ?? item.duration ?? 0)) / 60

  if (mins < 0.5 || mins > 20) return false

  const isMusicChannel = ['vevo', 'music', 'records', 'official', 'topic'].some(k => author.includes(k))
  const hasMusicTitle = ['official video', 'official audio', 'official music', 'lyrics', 'lyric video', 'feat.', 'ft.', 'remix'].some(k => title.includes(k))

  if (isMusicChannel || hasMusicTitle) return true

  const isNonMusic = NON_MUSIC_KEYWORDS.some(k => title.includes(k))
  return !isNonMusic
}

export async function searchTracks(query: string): Promise<YouTubeSearchResult[]> {
  const url = `${CORS_INSTANCE}/search?q=${encodeURIComponent(query)}&type=video`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Search error: ${res.status}`)
  const data = await res.json()
  return (data || [])
    .filter(isMusicContent)
    .map((item: any) => ({
      videoId: item.videoId,
      title: item.title,
      artist: item.author,
      thumbnail: `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
      duration: item.lengthSeconds ? formatDuration(item.lengthSeconds) : '',
    }))
}

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
    const url = `${CORS_INSTANCE}/channels/${direct}`
    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      return {
        channelId: direct,
        name: data.author || 'Unknown',
        thumbnail: data.authorThumbnails?.[data.authorThumbnails.length - 1]?.url || '',
      }
    }
  }

  const searchQuery = input.replace(/^@/, '').replace(/youtube\.com\/@?/, '')
  const url = `${CORS_INSTANCE}/search?q=${encodeURIComponent(searchQuery)}&type=channel`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()
  const channel = Array.isArray(data) ? data[0] : null
  if (!channel?.authorId) return null
  return {
    channelId: channel.authorId,
    name: channel.author || 'Unknown',
    thumbnail: channel.authorThumbnails?.[channel.authorThumbnails.length - 1]?.url || '',
  }
}

async function fetchChannelPlaylistsFromInstance(baseUrl: string, channelId: string): Promise<Playlist[]> {
  const playlists: Playlist[] = []
  let continuation: string | undefined

  do {
    let url = `${baseUrl}/channels/${channelId}/playlists?sort=oldest`
    if (continuation) url += `&continuation=${encodeURIComponent(continuation)}`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)

    let res: Response
    try {
      res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeout)
    } catch {
      clearTimeout(timeout)
      throw new Error('Channel playlists request failed')
    }

    if (!res.ok) throw new Error(`Channel playlists error: ${res.status}`)
    const data = await res.json()

    const items: any[] = Array.isArray(data) ? data : (Array.isArray(data.playlists) ? data.playlists : [])

    for (const item of items) {
      if (item.playlistId?.startsWith('LL')) continue
      playlists.push({
        id: item.playlistId || item.id,
        title: item.title || 'Untitled',
        description: item.description || '',
        thumbnail: item.thumbnailUrl || item.thumbnails?.[0]?.url || '',
        tracks: [],
        source: 'youtube',
      })
    }

    continuation = data.continuation
  } while (continuation)

  return playlists
}

export async function fetchChannelPlaylists(channelId: string): Promise<Playlist[]> {
  let lastError: Error | null = null
  for (const baseUrl of INSTANCES) {
    try {
      return await fetchChannelPlaylistsFromInstance(baseUrl, channelId)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError || new Error(`Failed to fetch playlists for channel ${channelId}`)
}

export async function fetchPlaylistById(playlistId: string): Promise<Playlist> {
  let lastError: Error | null = null

  for (const baseUrl of INSTANCES) {
    try {
      return await fetchPlaylistFromInstance(baseUrl, playlistId)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  try {
    return await fetchPlaylistRss(playlistId)
  } catch (err) {
    lastError = err instanceof Error ? err : new Error(String(err))
  }

  throw lastError || new Error(`Failed to fetch playlist ${playlistId}`)
}

async function fetchPlaylistFromInstance(baseUrl: string, playlistId: string): Promise<Playlist> {
  const url = `${baseUrl}/playlists/${playlistId}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timeout)
    if (!res.ok) throw new Error(`Playlist error: ${res.status}`)
    const data = await res.json()

    const tracks: Track[] = (data.videos || [])
      .filter(isMusicContent)
      .map((v: any) => ({
        id: v.videoId,
        videoId: v.videoId,
        title: v.title,
        artist: v.author,
        thumbnail: `https://i.ytimg.com/vi/${v.videoId}/hqdefault.jpg`,
        duration: v.lengthSeconds || 0,
      }))

    return {
      id: playlistId,
      title: data.title || 'Untitled Playlist',
      description: data.description || '',
      thumbnail: data.thumbnailUrl || tracks[0]?.thumbnail || '',
      tracks,
      source: 'youtube',
    }
  } catch (err) {
    clearTimeout(timeout)
    throw err
  }
}

async function fetchPlaylistRss(playlistId: string): Promise<Playlist> {
  const url = `${RSS_FEED}?playlist_id=${playlistId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`RSS playlist error: ${res.status}`)
  const xml = await res.text()
  return parseRssPlaylist(xml, playlistId)
}

function parseRssPlaylist(xml: string, playlistId: string): Playlist {
  const title = extractXmlTag(xml, 'title') || 'Untitled Playlist'
  const entries = xml.split('<entry>').slice(1)

  const tracks: Track[] = entries
    .map((entry) => {
      const videoId = extractXmlTag(entry, 'yt:videoId') || ''
      const trackTitle = extractXmlTag(entry, 'title') || 'Unknown'
      const author = extractXmlTag(entry, 'name') || 'Unknown Artist'
      const thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
      const mediaGroup = entry.match(/<media:content[^>]*>/)
      let duration = 0
      if (mediaGroup) {
        const durMatch = mediaGroup[0].match(/duration="(\d+)"/)
        if (durMatch) duration = parseInt(durMatch[1])
      }
      return {
        id: videoId,
        videoId,
        title: trackTitle,
        artist: author,
        thumbnail: thumbnailUrl,
        duration,
      }
    })
    .filter(isMusicContent)

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

export function formatDuration(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

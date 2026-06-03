import type { YouTubeSearchResult, Playlist, Track } from '../types'
import { searchVideos, getPlaylistVideos } from './innertube'

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

function isMusicContent(item: any): boolean {
  const title = (item.title || '').toLowerCase()
  const author = (item.artist || '').toLowerCase()
  const mins = (item.duration || 0) / 60

  if (mins < 0.5 || mins > 20) return false

  const isMusicChannel = ['vevo', 'music', 'records', 'official', 'topic'].some(k => author.includes(k))
  const hasMusicTitle = ['official video', 'official audio', 'official music', 'lyrics', 'lyric video', 'feat.', 'ft.', 'remix'].some(k => title.includes(k))

  if (isMusicChannel || hasMusicTitle) return true

  const isNonMusic = NON_MUSIC_KEYWORDS.some(k => title.includes(k))
  return !isNonMusic
}

export async function searchTracks(query: string): Promise<YouTubeSearchResult[]> {
  const videos = await searchVideos(query)
  return videos
    .filter(isMusicContent)
    .map((v) => ({
      videoId: v.videoId,
      title: v.title,
      artist: v.artist,
      thumbnail: v.thumbnail,
      duration: formatDuration(v.duration),
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

export async function fetchPlaylistById(playlistId: string): Promise<Playlist> {
  try {
    return await fetchPlaylistInnertube(playlistId)
  } catch {
    return await fetchPlaylistRss(playlistId)
  }
}

async function fetchPlaylistInnertube(playlistId: string): Promise<Playlist> {
  const videos = await getPlaylistVideos(playlistId)

  const tracks: Track[] = videos.map((v) => ({
    id: v.videoId,
    videoId: v.videoId,
    title: v.title,
    artist: v.artist,
    thumbnail: v.thumbnail,
    duration: v.duration,
  }))

  return {
    id: playlistId,
    title: 'Playlist',
    description: '',
    thumbnail: tracks[0]?.thumbnail || '',
    tracks,
    source: 'youtube',
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

  const tracks: Track[] = entries.map((entry) => {
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

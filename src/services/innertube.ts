import { Innertube, Platform } from 'youtubei.js'

let yt: InstanceType<typeof Innertube> | null = null
let initPromise: Promise<InstanceType<typeof Innertube>> | null = null

function ensureEval() {
  try {
    const currentEval = Platform.shim.eval
    if (typeof currentEval === 'function' && currentEval.toString().includes('must provide your own')) {
      Platform.load({
        ...Platform.shim,
        eval: function(data: any, _env: any) {
          const code = data.output.replace(/\b(let|const|var)\s+exportedVars\s*=/g, 'exportedVars =')
          const fn = new Function('exportedVars', code)
          return fn({})
        },
      })
    }
  } catch {
    // Platform not loaded yet; will be called again
  }
}

async function getClient(): Promise<InstanceType<typeof Innertube>> {
  ensureEval()
  if (yt) return yt
  if (!initPromise) {
    initPromise = Innertube.create({ lang: 'en', location: 'US' })
  }
  yt = await initPromise
  return yt
}

async function tryDecipher(formats: any[], player: any): Promise<string | null> {
  for (const fmt of formats) {
    if (fmt.url) return fmt.url
    if (fmt.signature_cipher || fmt.cipher) {
      try {
        return await fmt.decipher(player)
      } catch {
        continue
      }
    }
  }
  return null
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  const client = await getClient()
  const info = await client.getInfo(videoId)
  const player = client.session.player
  if (!player) throw new Error('No player available')

  const audioFormats = (info.streaming_data?.adaptive_formats || [])
    .filter((f: any) => f.mime_type?.startsWith('audio/'))

  const url = await tryDecipher(audioFormats, player)
  if (url) return url

  const combinedFormats = info.streaming_data?.formats || []
  const combinedUrl = await tryDecipher(combinedFormats, player)
  if (combinedUrl) return combinedUrl

  throw new Error('Could not decipher audio URL')
}

export async function searchVideos(query: string): Promise<{
  videoId: string
  title: string
  artist: string
  thumbnail: string
  duration: number
}[]> {
  const client = await getClient()
  const results = await client.search(query)
  const videos = results.videos?.slice(0, 20) || []

  return videos.map((v: any) => ({
    videoId: v.id || '',
    title: v.title?.toString() || 'Unknown',
    artist: v.author?.name?.toString() || 'Unknown Artist',
    thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    duration: v.duration?.seconds || 0,
  }))
}

export async function getPlaylistVideos(playlistId: string): Promise<{
  id: string
  videoId: string
  title: string
  artist: string
  thumbnail: string
  duration: number
}[]> {
  const client = await getClient()
  const playlist = await client.getPlaylist(playlistId)

  return playlist.items.map((v: any) => ({
    id: v.id || '',
    videoId: v.id || '',
    title: v.title?.toString() || 'Unknown',
    artist: v.author?.name?.toString() || 'Unknown Artist',
    thumbnail: v.thumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`,
    duration: v.duration?.seconds || 0,
  }))
}

export async function getChannelPlaylists(channelId: string): Promise<{
  id: string
  title: string
  description: string
  thumbnail: string
  videoCount: number
}[]> {
  const client = await getClient()
  const channel = await client.getChannel(channelId)
  if (!channel.has_playlists) return []

  const playlistsChannel = await channel.getPlaylists()
  const playlists: { id: string; title: string; description: string; thumbnail: string; videoCount: number }[] = []

  const content = playlistsChannel.current_tab?.content
  if (!content) return playlists

  const items = (content as any).contents || []
  for (const item of items) {
    if (item.type === 'Playlist') {
      const pl = item as any
      if (pl.id?.startsWith('LL')) continue
      playlists.push({
        id: pl.id || '',
        title: pl.title?.text || 'Untitled',
        description: pl.description || '',
        thumbnail: pl.thumbnails?.[0]?.url || '',
        videoCount: parseInt(pl.video_count?.text || '0') || 0,
      })
    }
  }

  return playlists
}

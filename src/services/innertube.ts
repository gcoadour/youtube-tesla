import { Innertube } from 'youtubei.js'

let yt: InstanceType<typeof Innertube> | null = null
let initPromise: Promise<InstanceType<typeof Innertube>> | null = null

async function getClient(): Promise<InstanceType<typeof Innertube>> {
  if (yt) return yt
  if (!initPromise) {
    initPromise = Innertube.create({ lang: 'en', location: 'US' })
  }
  yt = await initPromise
  return yt
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  const client = await getClient()
  const rawResponse = await client.actions.execute('/player', {
    videoId,
    parse: false,
    client: 'ANDROID',
  })

  const formats = rawResponse.data?.streamingData?.formats || []
  if (formats.length > 0 && formats[0].url) {
    return formats[0].url
  }

  const adaptiveFormats = rawResponse.data?.streamingData?.adaptiveFormats || []
  for (const f of adaptiveFormats) {
    if (f.mimeType?.startsWith('audio/') && f.url) {
      return f.url
    }
  }

  throw new Error('Could not get audio URL from ANDROID client')
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

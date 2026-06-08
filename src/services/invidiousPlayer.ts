import { getAudioStreamUrl as getInnerTubeStreamUrl } from './innertube'

function isDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  if (isDev()) return `/api/yt-audio/${videoId}`

  try {
    return await getInnerTubeStreamUrl(videoId)
  } catch {
    // InnerTube failed, try Invidious
  }

  const instances = ['https://inv.thepixora.com/api/v1']

  for (const baseUrl of instances) {
    try {
      const res = await fetch(`${baseUrl}/videos/${encodeURIComponent(videoId)}`)
      if (!res.ok) continue

      const data = await res.json()
      if (data.error) continue

      const audioFormats = (data.adaptiveFormats || [])
        .filter((f: any) => f.type?.startsWith('audio/'))
        .sort((a: any, b: any) => b.bitrate - a.bitrate)

      if (audioFormats.length > 0) return audioFormats[0].url
      if (data.formatStreams?.length > 0) return data.formatStreams[0].url
    } catch {
      continue
    }
  }

  throw new Error('All audio sources failed')
}

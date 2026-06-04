const INSTANCES = [
  'https://inv.thepixora.com/api/v1',
]

interface AudioFormat {
  url: string
  type: string
  bitrate: number
  itag: number
}

interface VideoData {
  adaptiveFormats: AudioFormat[]
  formatStreams: { url: string; type: string }[]
}

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  let lastError: Error | null = null

  for (const baseUrl of INSTANCES) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 15000)

      const res = await fetch(`${baseUrl}/videos/${encodeURIComponent(videoId)}`, {
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        if (res.status === 404) continue
        throw new Error(`HTTP ${res.status}`)
      }

      const data: VideoData = await res.json()

      if (!data.adaptiveFormats?.length && !data.formatStreams?.length) {
        throw new Error('No stream formats available')
      }

      const audioFormats = (data.adaptiveFormats || [])
        .filter(f => f.type?.startsWith('audio/'))
        .sort((a, b) => b.bitrate - a.bitrate)

      if (audioFormats.length > 0) {
        return audioFormats[0].url
      }

      if (data.formatStreams?.length > 0) {
        return data.formatStreams[0].url
      }

      throw new Error('No audio stream found')
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }

  throw lastError || new Error('All Invidious instances failed')
}

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json',
}

const INSTANCES = [
  'https://inv.thepixora.com/api/v1',
  'https://invidious.f5.si/api/v1',
  'https://invidious.nerdvpn.de/api/v1',
  'https://yt.chocolatemoo53.com/api/v1',
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
        headers: HEADERS,
      })
      clearTimeout(timeout)

      if (!res.ok) {
        if (res.status === 404 || res.status === 403 || res.status === 401) continue
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

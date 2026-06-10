import { getAudioStreamUrl as getInnerTubeStreamUrl } from './innertube'
import { getAudioUrlFromInvidious, fetchInstances } from './invidious'

function isDev(): boolean {
  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

// Prefetch instances on module load
fetchInstances().catch(() => {})

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  if (isDev()) return `/api/yt-audio/${videoId}`

  try {
    return await getInnerTubeStreamUrl(videoId)
  } catch {
    // InnerTube failed, try Invidious
  }

  return getAudioUrlFromInvidious(videoId)
}

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

export async function getAudioBlob(videoId: string): Promise<Blob> {
  const streamUrl = await getAudioStreamUrl(videoId)
  const response = await fetch(streamUrl)
  if (!response.ok) {
    throw new Error(`Failed to fetch audio blob: ${response.status} ${response.statusText}`)
  }
  return response.blob()
}

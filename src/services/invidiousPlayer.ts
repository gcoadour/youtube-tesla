import { getAudioStreamUrl as innertubeGetAudioStreamUrl } from './innertube'

export async function getAudioStreamUrl(videoId: string): Promise<string> {
  return innertubeGetAudioStreamUrl(videoId)
}

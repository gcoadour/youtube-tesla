import type { SponsorBlockSegment } from '../types'

const SB_API = 'https://sponsor.ajay.app/api'

export async function getSponsorSegments(videoId: string): Promise<SponsorBlockSegment[]> {
  try {
    const url = `${SB_API}/skipSegments?videoID=${videoId}&category=sponsor`
    const res = await fetch(url)
    if (!res.ok) {
      if (res.status === 404) return []
      throw new Error(`SponsorBlock error: ${res.status}`)
    }
    const data: SponsorBlockSegment[] = await res.json()
    return data
  } catch {
    return []
  }
}

export function getCurrentSegment(
  segments: SponsorBlockSegment[],
  currentTime: number,
): SponsorBlockSegment | null {
  for (const seg of segments) {
    const [start, end] = seg.segment
    if (currentTime >= start && currentTime < end) {
      return seg
    }
  }
  return null
}

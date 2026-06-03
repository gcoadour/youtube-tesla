export interface Track {
  id: string
  videoId: string
  title: string
  artist: string
  thumbnail: string
  duration: number
  album?: string
}

export interface Playlist {
  id: string
  title: string
  description: string
  thumbnail: string
  tracks: Track[]
  source: 'youtube' | 'local'
}

export interface SponsorBlockSegment {
  segment: [number, number]
  category: string
}

export interface PlayerState {
  currentTrack: Track | null
  queue: Track[]
  queueIndex: number
  isPlaying: boolean
  volume: number
  progress: number
  duration: number
  isMuted: boolean
  shuffle: boolean
  repeat: 'off' | 'all' | 'one'
}

export interface YouTubeSearchResult {
  videoId: string
  title: string
  artist: string
  thumbnail: string
  duration: string
}

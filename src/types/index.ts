export interface Track {
  id: string
  videoId: string
  title: string
  artist: string
  thumbnail: string
  /** En secondes. 0 signifie « durée inconnue », pas « piste vide ». */
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
  /** Message affiché à l'utilisateur quand aucune source audio ne répond. */
  playbackError: string | null
  /** Vrai pendant la résolution de l'URL et la mise en tampon. */
  isLoading: boolean
}

export interface YouTubeSearchResult {
  videoId: string
  title: string
  artist: string
  thumbnail: string
  /** En secondes, comme Track.duration — la mise en forme se fait à l'affichage. */
  duration: number
}

export interface ImportedPlaylist {
  id: string
  source: 'youtube' | 'local'
}

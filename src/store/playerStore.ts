import { create } from 'zustand'
import type { Track, PlayerState, SponsorBlockSegment } from '../types'

interface PlayerStore extends PlayerState {
  playlists: import('../types').Playlist[]
  likedTracks: Set<string>
  sponsorBlockSegments: SponsorBlockSegment[]

  setCurrentTrack: (track: Track) => void
  setQueue: (tracks: Track[], startIndex?: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  next: () => void
  previous: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  seekTo: (time: number) => void
  registerPlayerSeeker: (fn: (time: number) => void) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setSponsorBlockSegments: (segments: SponsorBlockSegment[]) => void
  toggleLikeTrack: (trackId: string) => void
  setPlaylists: (playlists: import('../types').Playlist[]) => void
  addPlaylist: (playlist: import('../types').Playlist) => void
  updatePlaylistTracks: (id: string, tracks: import('../types').Track[]) => void
}

let _playerSeeker: ((time: number) => void) | null = null

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  currentTrack: null,
  queue: [],
  queueIndex: -1,
  isPlaying: false,
  volume: 0.7,
  progress: 0,
  duration: 0,
  isMuted: false,
  shuffle: false,
  repeat: 'off',
  playlists: [],
  likedTracks: new Set(JSON.parse(localStorage.getItem('yt-liked-tracks') || '[]')),
  sponsorBlockSegments: [],

  setCurrentTrack: (track) => set({ currentTrack: track }),

  setQueue: (tracks, startIndex = 0) =>
    set({ queue: tracks, queueIndex: startIndex, currentTrack: tracks[startIndex] || null }),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  next: () => {
    const { queue, queueIndex, shuffle, repeat } = get()
    if (queue.length === 0) return

    if (repeat === 'one') {
      set({ progress: 0 })
      _playerSeeker?.(0)
      return
    }

    let nextIndex: number
    if (shuffle) {
      let candidate: number
      do {
        candidate = Math.floor(Math.random() * queue.length)
      } while (queue.length > 1 && candidate === queueIndex)
      nextIndex = candidate
    } else {
      nextIndex = queueIndex + 1
    }
    if (nextIndex >= queue.length) {
      if (repeat === 'all') {
        nextIndex = 0
      } else {
        return
      }
    }
    set({
      queueIndex: nextIndex,
      currentTrack: queue[nextIndex],
      progress: 0,
      sponsorBlockSegments: [],
    })
  },

  previous: () => {
    const { queue, queueIndex } = get()
    if (queue.length === 0) return
    const prevIndex = queueIndex - 1
    if (prevIndex < 0) return
    set({
      queueIndex: prevIndex,
      currentTrack: queue[prevIndex],
      progress: 0,
      sponsorBlockSegments: [],
    })
  },

  setVolume: (volume) => set({ volume }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setProgress: (progress) => set({ progress }),
  setDuration: (duration) => set({ duration }),
  seekTo: (time) => {
    set({ progress: time })
    _playerSeeker?.(time)
  },
  registerPlayerSeeker: (fn) => { _playerSeeker = fn },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),
  toggleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),

  setSponsorBlockSegments: (segments) => set({ sponsorBlockSegments: segments }),

  toggleLikeTrack: (trackId) => {
    const { likedTracks } = get()
    const next = new Set(likedTracks)
    if (next.has(trackId)) {
      next.delete(trackId)
    } else {
      next.add(trackId)
    }
    localStorage.setItem('yt-liked-tracks', JSON.stringify([...next]))
    set({ likedTracks: next })
  },

  setPlaylists: (playlists) => set({ playlists }),
  addPlaylist: (playlist) =>
    set((s) => ({ playlists: [...s.playlists, playlist] })),
  updatePlaylistTracks: (id, tracks) =>
    set((s) => ({
      playlists: s.playlists.map((p) =>
        p.id === id ? { ...p, tracks } : p
      ),
    })),
}))

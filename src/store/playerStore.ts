import { create } from 'zustand'
import type { Track, PlayerState, SponsorBlockSegment, ImportedPlaylist, Playlist } from '../types'

const STORAGE_KEY = 'yt-imported-playlists'
const PLAYLISTS_KEY = 'yt-playlists'

function loadImportedIds(): ImportedPlaylist[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function saveImportedIds(playlists: ImportedPlaylist[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists))
}

function loadPlaylists(): Playlist[] {
  try {
    return JSON.parse(localStorage.getItem(PLAYLISTS_KEY) || '[]')
  } catch {
    return []
  }
}

function savePlaylists(playlists: Playlist[]): void {
  localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists))
}

interface PlayerStore extends PlayerState {
  playlists: Playlist[]
  importedPlaylists: ImportedPlaylist[]
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
  setPlaylists: (playlists: Playlist[]) => void
  addPlaylist: (playlist: Playlist) => void
  removePlaylist: (id: string) => void
  updatePlaylistTracks: (id: string, tracks: Track[]) => void
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
  playlists: loadPlaylists(),
  importedPlaylists: loadImportedIds(),
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

  setPlaylists: (playlists) => {
    savePlaylists(playlists)
    set({ playlists })
  },

  addPlaylist: (playlist) => {
    const { importedPlaylists } = get()
    const exists = importedPlaylists.some((p) => p.id === playlist.id)
    if (!exists) {
      const updated = [...importedPlaylists, { id: playlist.id, source: playlist.source }]
      saveImportedIds(updated)
      set((s) => {
        const newPlaylists = [...s.playlists, playlist]
        savePlaylists(newPlaylists)
        return {
          playlists: newPlaylists,
          importedPlaylists: updated,
        }
      })
    } else {
      set((s) => {
        const newPlaylists = [...s.playlists, playlist]
        savePlaylists(newPlaylists)
        return { playlists: newPlaylists }
      })
    }
  },

  removePlaylist: (id) => {
    const { importedPlaylists } = get()
    const updated = importedPlaylists.filter((p) => p.id !== id)
    saveImportedIds(updated)
    set((s) => {
      const newPlaylists = s.playlists.filter((p) => p.id !== id)
      savePlaylists(newPlaylists)
      return {
        playlists: newPlaylists,
        importedPlaylists: updated,
      }
    })
  },

  updatePlaylistTracks: (id, tracks) =>
    set((s) => {
      const newPlaylists = s.playlists.map((p) =>
        p.id === id ? { ...p, tracks } : p
      )
      savePlaylists(newPlaylists)
      return { playlists: newPlaylists }
    }),
}))

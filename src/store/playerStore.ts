import { create } from 'zustand'
import type { Track, PlayerState, SponsorBlockSegment, ImportedPlaylist, Playlist } from '../types'
import * as library from '../services/playlistStore'

const LIKED_KEY = 'yt-liked-tracks'

/** En dessous de ce seuil, « précédent » revient à la piste d'avant ; au-dessus, il rembobine. */
const RESTART_THRESHOLD_SECONDS = 3

function loadLiked(): Set<string> {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(LIKED_KEY) || '[]'))
  } catch {
    return new Set<string>()
  }
}

/** Mélange de Fisher-Yates : ordre stable, chaque piste passe une fois et une seule. */
function shuffledOrder(length: number, firstIndex: number): number[] {
  const order = Array.from({ length }, (_, i) => i)
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  // La piste en cours reste en tête pour ne pas sauter au moment d'activer le mode aléatoire.
  const pos = order.indexOf(firstIndex)
  if (pos > 0) {
    ;[order[0], order[pos]] = [order[pos], order[0]]
  }
  return order
}

interface PlayerStore extends PlayerState {
  playlists: Playlist[]
  importedPlaylists: ImportedPlaylist[]
  likedTracks: Set<string>
  sponsorBlockSegments: SponsorBlockSegment[]
  /** Ordre de lecture aléatoire courant (indices dans `queue`), vide hors mode aléatoire. */
  shuffleOrder: number[]
  hydrated: boolean
  /** Vrai pendant un glissement sur la barre de progression. */
  scrubbing: boolean

  hydrate: () => Promise<void>
  setCurrentTrack: (track: Track) => void
  setQueue: (tracks: Track[], startIndex?: number) => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  next: (auto?: boolean) => void
  previous: () => void
  setVolume: (volume: number) => void
  toggleMute: () => void
  setProgress: (progress: number) => void
  setDuration: (duration: number) => void
  seekTo: (time: number) => void
  registerPlayerSeeker: (fn: (time: number) => void) => void
  registerPlayerReplay: (fn: () => void) => void
  toggleShuffle: () => void
  toggleRepeat: () => void
  setSponsorBlockSegments: (segments: SponsorBlockSegment[]) => void
  setPlaybackError: (message: string | null) => void
  setScrubbing: (scrubbing: boolean) => void
  setLoading: (loading: boolean) => void
  toggleLikeTrack: (trackId: string) => void
  setPlaylists: (playlists: Playlist[]) => void
  addPlaylist: (playlist: Playlist) => void
  removePlaylist: (id: string) => void
  updatePlaylistTracks: (id: string, tracks: Track[]) => void
}

let _playerSeeker: ((time: number) => void) | null = null
let _playerReplay: (() => void) | null = null

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
  playbackError: null,
  isLoading: false,
  playlists: [],
  importedPlaylists: [],
  likedTracks: loadLiked(),
  sponsorBlockSegments: [],
  shuffleOrder: [],
  hydrated: false,
  scrubbing: false,

  // La bibliothèque vit dans IndexedDB : son chargement est asynchrone, donc le
  // store démarre vide puis se remplit. `hydrated` évite d'afficher « aucune
  // playlist » pendant ce laps de temps.
  hydrate: async () => {
    if (get().hydrated) return
    try {
      const { playlists, imported } = await library.loadLibrary()
      set({ playlists, importedPlaylists: imported, hydrated: true })
    } catch {
      set({ hydrated: true })
    }
  },

  setCurrentTrack: (track) => set({ currentTrack: track, playbackError: null }),

  setQueue: (tracks, startIndex = 0) =>
    set((s) => ({
      queue: tracks,
      queueIndex: startIndex,
      currentTrack: tracks[startIndex] || null,
      progress: 0,
      playbackError: null,
      sponsorBlockSegments: [],
      shuffleOrder: s.shuffle ? shuffledOrder(tracks.length, startIndex) : [],
    })),

  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),

  /**
   * `auto` distingue la fin naturelle d'une piste d'un appui sur « suivant ».
   * Seule la fin naturelle honore `repeat: 'one'` — sinon le bouton suivant
   * serait sans effet sur une piste en boucle.
   */
  next: (auto = false) => {
    const { queue, queueIndex, shuffle, repeat, shuffleOrder } = get()
    if (queue.length === 0) return

    if (auto && repeat === 'one') {
      set({ progress: 0 })
      _playerSeeker?.(0)
      // Après « ended » l'élément audio est en pause : il faut le relancer.
      _playerReplay?.()
      return
    }

    let nextIndex: number
    if (shuffle && shuffleOrder.length === queue.length) {
      const pos = shuffleOrder.indexOf(queueIndex)
      const nextPos = pos + 1
      if (nextPos >= shuffleOrder.length) {
        if (repeat === 'all') {
          const reshuffled = shuffledOrder(queue.length, shuffleOrder[0])
          set({ shuffleOrder: reshuffled })
          nextIndex = reshuffled[0]
        } else {
          set({ isPlaying: false })
          return
        }
      } else {
        nextIndex = shuffleOrder[nextPos]
      }
    } else {
      nextIndex = queueIndex + 1
      if (nextIndex >= queue.length) {
        if (repeat === 'all') {
          nextIndex = 0
        } else {
          set({ isPlaying: false })
          return
        }
      }
    }

    set({
      queueIndex: nextIndex,
      currentTrack: queue[nextIndex],
      progress: 0,
      playbackError: null,
      sponsorBlockSegments: [],
    })
  },

  previous: () => {
    const { queue, queueIndex, progress, shuffle, shuffleOrder } = get()
    if (queue.length === 0) return

    // Comportement attendu de tout lecteur : passé quelques secondes,
    // « précédent » rembobine la piste courante avant de reculer dans la file.
    if (progress > RESTART_THRESHOLD_SECONDS) {
      set({ progress: 0 })
      _playerSeeker?.(0)
      return
    }

    let prevIndex: number
    if (shuffle && shuffleOrder.length === queue.length) {
      const pos = shuffleOrder.indexOf(queueIndex)
      if (pos <= 0) {
        set({ progress: 0 })
        _playerSeeker?.(0)
        return
      }
      prevIndex = shuffleOrder[pos - 1]
    } else {
      prevIndex = queueIndex - 1
      if (prevIndex < 0) {
        set({ progress: 0 })
        _playerSeeker?.(0)
        return
      }
    }

    set({
      queueIndex: prevIndex,
      currentTrack: queue[prevIndex],
      progress: 0,
      playbackError: null,
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
  registerPlayerReplay: (fn) => { _playerReplay = fn },

  toggleShuffle: () =>
    set((s) => {
      const shuffle = !s.shuffle
      return {
        shuffle,
        shuffleOrder: shuffle ? shuffledOrder(s.queue.length, s.queueIndex) : [],
      }
    }),

  toggleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off',
    })),

  setSponsorBlockSegments: (segments) => set({ sponsorBlockSegments: segments }),
  setPlaybackError: (playbackError) => set({ playbackError }),
  setScrubbing: (scrubbing) => set({ scrubbing }),
  setLoading: (isLoading) => set({ isLoading }),

  toggleLikeTrack: (trackId) => {
    const next = new Set(get().likedTracks)
    if (next.has(trackId)) next.delete(trackId)
    else next.add(trackId)
    try {
      localStorage.setItem(LIKED_KEY, JSON.stringify([...next]))
    } catch {
      // stockage plein : le like reste valable pour la session
    }
    set({ likedTracks: next })
  },

  setPlaylists: (playlists) => {
    library.savePlaylists(playlists).catch(() => {})
    set({ playlists })
  },

  /**
   * Ajoute ou met à jour une playlist.
   *
   * L'ancienne version ré-empilait la playlist dans `playlists` quand elle était
   * déjà connue de `importedPlaylists`, ce qui créait un doublon visible dans la
   * bibliothèque à chaque réimport.
   */
  addPlaylist: (playlist) => {
    set((s) => {
      const index = s.playlists.findIndex((p) => p.id === playlist.id)
      const playlists =
        index >= 0
          ? s.playlists.map((p) => (p.id === playlist.id ? playlist : p))
          : [...s.playlists, playlist]

      const alreadyImported = s.importedPlaylists.some((p) => p.id === playlist.id)
      const importedPlaylists = alreadyImported
        ? s.importedPlaylists
        : [...s.importedPlaylists, { id: playlist.id, source: playlist.source }]

      library.savePlaylist(playlist).catch(() => {})
      if (!alreadyImported) library.saveImported(importedPlaylists).catch(() => {})

      return { playlists, importedPlaylists }
    })
  },

  removePlaylist: (id) => {
    set((s) => {
      const playlists = s.playlists.filter((p) => p.id !== id)
      const importedPlaylists = s.importedPlaylists.filter((p) => p.id !== id)
      library.deletePlaylist(id).catch(() => {})
      library.saveImported(importedPlaylists).catch(() => {})
      return { playlists, importedPlaylists }
    })
  },

  updatePlaylistTracks: (id, tracks) =>
    set((s) => {
      const playlists = s.playlists.map((p) => (p.id === id ? { ...p, tracks } : p))
      const updated = playlists.find((p) => p.id === id)
      if (updated) library.savePlaylist(updated).catch(() => {})
      return { playlists }
    }),
}))

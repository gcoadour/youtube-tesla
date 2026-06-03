{% raw %}
# Spotify Tesla Clone — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a zero-backend Spotify Tesla clone SPA using YouTube APIs and SponsorBlock.

**Architecture:** Static Vite + React SPA. YouTube Data API v3 for search/playlists, YouTube IFrame Player for audio playback, SponsorBlock API for ad skipping. All API calls client-side. Zustand for state. localStorage for persistence.

**Tech Stack:** Vite, React 18, TypeScript, Zustand, react-router-dom v6

---

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "spotify-tesla-clone",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Spotify Tesla</title>
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 7: Create src/vite-env.d.ts**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: node_modules/ created, package-lock.json created

- [ ] **Step 9: Verify dev server starts**

Run: `npm run dev`
Expected: Vite dev server starts on localhost:5173

---

### Task 2: TypeScript types

**Files:**
- Create: `src/types/index.ts`

- [ ] **Step 1: Create src/types/index.ts**

```ts
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
```

---

### Task 3: Zustand player store

**Files:**
- Create: `src/store/playerStore.ts`

- [ ] **Step 1: Create src/store/playerStore.ts**

```ts
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
  toggleShuffle: () => void
  toggleRepeat: () => void
  setSponsorBlockSegments: (segments: SponsorBlockSegment[]) => void
  toggleLikeTrack: (trackId: string) => void
  setPlaylists: (playlists: import('../types').Playlist[]) => void
  addPlaylist: (playlist: import('../types').Playlist) => void
}

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
    let nextIndex: number
    if (shuffle) {
      nextIndex = Math.floor(Math.random() * queue.length)
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
  seekTo: (time) => set({ progress: time }),

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
}))
```

---

### Task 4: YouTube service

**Files:**
- Create: `src/services/youtube.ts`

- [ ] **Step 1: Create src/services/youtube.ts**

```ts
import type { YouTubeSearchResult, Playlist, Track } from '../types'

const YT_API_BASE = 'https://www.googleapis.com/youtube/v3'

let apiKey = localStorage.getItem('yt-api-key') || ''

export function setApiKey(key: string) {
  apiKey = key
  localStorage.setItem('yt-api-key', key)
}

export function getApiKey(): string {
  return apiKey
}

function buildUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${YT_API_BASE}${path}`)
  url.searchParams.set('key', apiKey)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

export async function searchTracks(query: string): Promise<YouTubeSearchResult[]> {
  const url = buildUrl('/search', {
    q: query,
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    maxResults: '20',
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()
  return data.items.map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    artist: item.snippet.channelTitle,
    thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
    duration: '',
  }))
}

export async function getVideoDuration(videoIds: string[]): Promise<Map<string, string>> {
  const url = buildUrl('/videos', {
    id: videoIds.join(','),
    part: 'contentDetails',
  })
  const res = await fetch(url)
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()
  const map = new Map<string, string>()
  for (const item of data.items) {
    map.set(item.id, item.contentDetails.duration)
  }
  return map
}

function parseISODuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
  if (!match) return 0
  const h = parseInt(match[1]?.replace('H', '') || '0')
  const m = parseInt(match[2]?.replace('M', '') || '0')
  const s = parseInt(match[3]?.replace('S', '') || '0')
  return h * 3600 + m * 60 + s
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export async function fetchUserPlaylists(accessToken: string): Promise<Playlist[]> {
  const url = `${YT_API_BASE}/playlists?mine=true&part=snippet,contentDetails&maxResults=50`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
  const data = await res.json()

  const playlists: Playlist[] = []
  for (const item of data.items) {
    const tracks = await fetchPlaylistTracks(item.id, accessToken)
    playlists.push({
      id: item.id,
      title: item.snippet.title,
      description: item.snippet.description || '',
      thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
      tracks,
      source: 'youtube',
    })
  }
  return playlists
}

async function fetchPlaylistTracks(playlistId: string, accessToken: string): Promise<Track[]> {
  const tracks: Track[] = []
  let nextPageToken: string | undefined

  do {
    const params = new URLSearchParams({
      playlistId,
      part: 'snippet',
      maxResults: '50',
    })
    if (nextPageToken) params.set('pageToken', nextPageToken)

    const url = `${YT_API_BASE}/playlistItems?${params}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`YouTube API error: ${res.status}`)
    const data = await res.json()

    for (const item of data.items) {
      const videoId = item.snippet.resourceId.videoId
      if (!videoId) continue
      tracks.push({
        id: videoId,
        videoId,
        title: item.snippet.title,
        artist: item.snippet.videoOwnerChannelTitle || 'Unknown',
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default.url,
        duration: 0,
      })
    }
    nextPageToken = data.nextPageToken
  } while (nextPageToken)

  return tracks
}
```

---

### Task 5: SponsorBlock service

**Files:**
- Create: `src/services/sponsorblock.ts`

- [ ] **Step 1: Create src/services/sponsorblock.ts**

```ts
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
```

---

### Task 6: Auth service

**Files:**
- Create: `src/services/auth.ts`

- [ ] **Step 1: Create src/services/auth.ts**

```ts
const CLIENT_ID = ''
const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly'
const REDIRECT_URI = `${window.location.origin}/oauth-callback`

export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: SCOPES,
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function handleRedirectCallback(): string | null {
  const hash = window.location.hash.substring(1)
  if (!hash) return null
  const params = new URLSearchParams(hash)
  const token = params.get('access_token')
  if (token) {
    localStorage.setItem('yt-oauth-token', token)
    const expiresIn = parseInt(params.get('expires_in') || '3600')
    const expiry = Date.now() + expiresIn * 1000
    localStorage.setItem('yt-oauth-expiry', expiry.toString())
    window.location.hash = ''
    return token
  }
  return null
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem('yt-oauth-token')
  const expiry = localStorage.getItem('yt-oauth-expiry')
  if (!token || !expiry) return null
  if (Date.now() > parseInt(expiry)) {
    localStorage.removeItem('yt-oauth-token')
    localStorage.removeItem('yt-oauth-expiry')
    return null
  }
  return token
}

export function logout() {
  localStorage.removeItem('yt-oauth-token')
  localStorage.removeItem('yt-oauth-expiry')
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null
}
```

---

### Task 7: Helper utilities

**Files:**
- Create: `src/utils/helpers.ts`

- [ ] **Step 1: Create src/utils/helpers.ts**

```ts
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>
  return (...args: Parameters<T>) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}

export function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '...' : str
}
```

---

### Task 8: YouTube Player hook

**Files:**
- Create: `src/hooks/useYouTubePlayer.ts`

- [ ] **Step 1: Create src/hooks/useYouTubePlayer.ts**

```ts
import { useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../store/playerStore'
import { getSponsorSegments, getCurrentSegment } from '../services/sponsorblock'

declare global {
  interface Window {
    YT: any
    onYouTubeIframeAPIReady: (() => void) | undefined
  }
}

let apiLoaded = false

function loadYouTubeAPI() {
  if (apiLoaded) return
  const tag = document.createElement('script')
  tag.src = 'https://www.youtube.com/iframe_api'
  const firstScript = document.getElementsByTagName('script')[0]
  firstScript.parentNode?.insertBefore(tag, firstScript)
  apiLoaded = true
}

export function useYouTubePlayer() {
  const playerRef = useRef<any>(null)
  const checkIntervalRef = useRef<number | null>(null)
  const playerReadyRef = useRef(false)

  const {
    currentTrack,
    isPlaying,
    volume,
    isMuted,
    progress,
    sponsorBlockSegments,
    setProgress,
    setDuration,
    setSponsorBlockSegments,
    next,
  } = usePlayerStore()

  useEffect(() => {
    loadYouTubeAPI()
  }, [])

  const initPlayer = useCallback(() => {
    if (playerReadyRef.current || !window.YT?.Player) return
    playerRef.current = new window.YT.Player('youtube-player', {
      height: '0',
      width: '0',
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true
          playerRef.current.setVolume(volume * 100)
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            usePlayerStore.getState().play()
          }
          if (event.data === window.YT.PlayerState.ENDED) {
            next()
          }
        },
      },
    })
  }, [volume, next])

  useEffect(() => {
    window.onYouTubeIframeAPIReady = () => {
      initPlayer()
    }
    if (window.YT?.Player) {
      initPlayer()
    }
  }, [initPlayer])

  useEffect(() => {
    if (!currentTrack) return

    const loadVideo = () => {
      if (!playerRef.current || !playerReadyRef.current) return
      playerRef.current.loadVideoById(currentTrack.videoId, 0)
      getSponsorSegments(currentTrack.videoId).then(setSponsorBlockSegments)
    }

    if (playerReadyRef.current) {
      loadVideo()
    } else {
      const check = setInterval(() => {
        if (playerReadyRef.current) {
          loadVideo()
          clearInterval(check)
        }
      }, 100)
      return () => clearInterval(check)
    }
  }, [currentTrack, setSponsorBlockSegments])

  useEffect(() => {
    if (!playerRef.current || !playerReadyRef.current) return
    if (isPlaying) {
      playerRef.current.playVideo()
    } else {
      playerRef.current.pauseVideo()
    }
  }, [isPlaying])

  useEffect(() => {
    if (!playerRef.current || !playerReadyRef.current) return
    playerRef.current.setVolume(isMuted ? 0 : volume * 100)
  }, [volume, isMuted])

  useEffect(() => {
    const interval = setInterval(() => {
      if (!playerRef.current || !playerReadyRef.current) return
      const currentTime = playerRef.current.getCurrentTime()
      const duration = playerRef.current.getDuration()
      setProgress(currentTime)
      setDuration(duration)

      const seg = getCurrentSegment(sponsorBlockSegments, currentTime)
      if (seg) {
        playerRef.current.seekTo(seg.segment[1], true)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [sponsorBlockSegments, setProgress, setDuration])

  const seekTo = useCallback((time: number) => {
    if (!playerRef.current || !playerReadyRef.current) return
    playerRef.current.seekTo(time, true)
    usePlayerStore.getState().setProgress(time)
  }, [])

  return { seekTo }
}
```

---

### Task 9: Layout components — Sidebar & NowPlayingBar

**Files:**
- Create: `src/components/Layout/Sidebar.tsx`
- Create: `src/components/Layout/NowPlayingBar.tsx`
- Create: `src/components/Layout/Layout.tsx`

- [ ] **Step 1: Create src/components/Layout/Sidebar.tsx**

```tsx
import { NavLink } from 'react-router-dom'
import { usePlayerStore } from '../../store/playerStore'

export default function Sidebar() {
  const playlists = usePlayerStore((s) => s.playlists)

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">Spotify</div>
      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">🏠</span>
          Home
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">🔍</span>
          Search
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-icon">📚</span>
          Your Library
        </NavLink>
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-playlists">
        <div className="sidebar-section-title">Playlists</div>
        {playlists.map((p) => (
          <NavLink
            key={p.id}
            to={`/playlist/${p.id}`}
            className={({ isActive }) => `playlist-link ${isActive ? 'active' : ''}`}
          >
            {p.title}
          </NavLink>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 2: Create src/components/Layout/NowPlayingBar.tsx**

```tsx
import { usePlayerStore } from '../../store/playerStore'
import PlayerControls from '../Player/PlayerControls'
import ProgressBar from '../Player/ProgressBar'
import VolumeControl from '../Player/VolumeControl'

export default function NowPlayingBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const likedTracks = usePlayerStore((s) => s.likedTracks)
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack)

  if (!currentTrack) return null

  const isLiked = likedTracks.has(currentTrack.id)

  return (
    <footer className="now-playing-bar">
      <div className="npb-left">
        <img
          className="npb-cover"
          src={currentTrack.thumbnail}
          alt={currentTrack.title}
        />
        <div className="npb-info">
          <div className="npb-title">{currentTrack.title}</div>
          <div className="npb-artist">{currentTrack.artist}</div>
        </div>
        <button
          className={`npb-like ${isLiked ? 'liked' : ''}`}
          onClick={() => toggleLikeTrack(currentTrack.id)}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          ♡
        </button>
      </div>
      <div className="npb-center">
        <PlayerControls />
        <ProgressBar />
      </div>
      <div className="npb-right">
        <VolumeControl />
      </div>
    </footer>
  )
}
```

- [ ] **Step 3: Create src/components/Layout/Layout.tsx**

```tsx
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer'

export default function Layout() {
  useYouTubePlayer()

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
      <div id="youtube-player" style={{ display: 'none' }} />
      <NowPlayingBar />
    </div>
  )
}
```

---

### Task 10: Player components

**Files:**
- Create: `src/components/Player/PlayerControls.tsx`
- Create: `src/components/Player/ProgressBar.tsx`
- Create: `src/components/Player/VolumeControl.tsx`

- [ ] **Step 1: Create src/components/Player/PlayerControls.tsx**

```tsx
import { usePlayerStore } from '../../store/playerStore'

export default function PlayerControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  return (
    <div className="player-controls">
      <button
        className={`control-btn ${shuffle ? 'active' : ''}`}
        onClick={toggleShuffle}
        aria-label="Shuffle"
      >
        🔀
      </button>
      <button
        className="control-btn"
        onClick={previous}
        disabled={!currentTrack}
        aria-label="Previous"
      >
        ⏮
      </button>
      <button
        className="control-btn play-btn"
        onClick={togglePlay}
        disabled={!currentTrack}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>
      <button
        className="control-btn"
        onClick={next}
        disabled={!currentTrack}
        aria-label="Next"
      >
        ⏭
      </button>
      <button
        className={`control-btn ${repeat !== 'off' ? 'active' : ''}`}
        onClick={toggleRepeat}
        aria-label="Repeat"
      >
        {repeat === 'one' ? '🔂' : '🔁'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create src/components/Player/ProgressBar.tsx**

```tsx
import { useRef, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { formatDuration } from '../../services/youtube'

export default function ProgressBar() {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const barRef = useRef<HTMLDivElement>(null)

  const seekTo = usePlayerStore((s) => s.seekTo)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !duration) return
      const rect = barRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      const time = ratio * duration
      seekTo(time)
    },
    [duration, seekTo],
  )

  const percent = duration ? (progress / duration) * 100 : 0

  return (
    <div className="progress-bar-container">
      <span className="progress-time">{formatDuration(progress)}</span>
      <div className="progress-bar" ref={barRef} onClick={handleClick}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-time">{formatDuration(duration)}</span>
    </div>
  )
}
```

- [ ] **Step 3: Create src/components/Player/VolumeControl.tsx**

```tsx
import { usePlayerStore } from '../../store/playerStore'

export default function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)

  return (
    <div className="volume-control">
      <button className="control-btn" onClick={toggleMute} aria-label="Mute">
        {isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
      </button>
      <div className="volume-slider">
        <div
          className="volume-fill"
          style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="volume-range"
          aria-label="Volume"
        />
      </div>
    </div>
  )
}
```

---

### Task 11: Playlist components

**Files:**
- Create: `src/components/Playlist/PlaylistGrid.tsx`
- Create: `src/components/Playlist/PlaylistCard.tsx`
- Create: `src/components/Playlist/PlaylistView.tsx`

- [ ] **Step 1: Create src/components/Playlist/PlaylistCard.tsx**

```tsx
import { useNavigate } from 'react-router-dom'
import type { Playlist } from '../../types'

interface Props {
  playlist: Playlist
}

export default function PlaylistCard({ playlist }: Props) {
  const navigate = useNavigate()

  return (
    <div className="playlist-card" onClick={() => navigate(`/playlist/${playlist.id}`)}>
      <div className="playlist-card-image">
        <img src={playlist.thumbnail} alt={playlist.title} />
      </div>
      <div className="playlist-card-body">
        <div className="playlist-card-title">{playlist.title}</div>
        <div className="playlist-card-desc">{playlist.description}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create src/components/Playlist/PlaylistGrid.tsx**

```tsx
import type { Playlist } from '../../types'
import PlaylistCard from './PlaylistCard'

interface Props {
  playlists: Playlist[]
  title?: string
}

export default function PlaylistGrid({ playlists, title }: Props) {
  return (
    <section className="playlist-grid-section">
      {title && <h2 className="section-title">{title}</h2>}
      <div className="playlist-grid">
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create src/components/Playlist/PlaylistView.tsx**

```tsx
import { usePlayerStore } from '../../store/playerStore'
import type { Playlist } from '../../types'
import TrackItem from '../common/TrackItem'

interface Props {
  playlist: Playlist
}

export default function PlaylistView({ playlist }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const handlePlayAll = () => {
    setQueue(playlist.tracks, 0)
    usePlayerStore.getState().play()
  }

  return (
    <div className="playlist-view">
      <div className="playlist-view-header">
        <img className="playlist-view-cover" src={playlist.thumbnail} alt={playlist.title} />
        <div className="playlist-view-meta">
          <div className="playlist-view-label">PLAYLIST</div>
          <h1 className="playlist-view-title">{playlist.title}</h1>
          <p className="playlist-view-desc">{playlist.description}</p>
          <button className="play-all-btn" onClick={handlePlayAll}>
            ▶ Play All
          </button>
        </div>
      </div>
      <div className="playlist-tracks">
        <div className="playlist-tracks-header">
          <span className="col-num">#</span>
          <span className="col-title">Title</span>
          <span className="col-artist">Artist</span>
          <span className="col-duration">Duration</span>
        </div>
        {playlist.tracks.map((track, i) => (
          <TrackItem
            key={track.id}
            track={track}
            index={i + 1}
            isActive={currentTrack?.id === track.id}
            onPlay={() => {
              setQueue(playlist.tracks, i)
              togglePlay()
            }}
          />
        ))}
      </div>
    </div>
  )
}
```

---

### Task 12: Common components

**Files:**
- Create: `src/components/common/TrackItem.tsx`
- Create: `src/components/common/AlbumArt.tsx`
- Create: `src/components/common/Spinner.tsx`

- [ ] **Step 1: Create src/components/common/TrackItem.tsx**

```tsx
import type { Track } from '../../types'
import { formatDuration } from '../../services/youtube'

interface Props {
  track: Track
  index: number
  isActive: boolean
  onPlay: () => void
}

export default function TrackItem({ track, index, isActive, onPlay }: Props) {
  return (
    <div
      className={`track-item ${isActive ? 'active' : ''}`}
      onDoubleClick={onPlay}
    >
      <span className="col-num">{index}</span>
      <div className="col-title">
        <img className="track-thumb" src={track.thumbnail} alt="" />
        <span>{track.title}</span>
      </div>
      <span className="col-artist">{track.artist}</span>
      <span className="col-duration">{formatDuration(track.duration)}</span>
    </div>
  )
}
```

- [ ] **Step 2: Create src/components/common/AlbumArt.tsx**

```tsx
interface Props {
  src: string
  alt: string
  size?: number
}

export default function AlbumArt({ src, alt, size = 48 }: Props) {
  return (
    <img
      className="album-art"
      src={src}
      alt={alt}
      width={size}
      height={size}
    />
  )
}
```

- [ ] **Step 3: Create src/components/common/Spinner.tsx**

```tsx
export default function Spinner() {
  return <div className="spinner" aria-label="Loading" />
}
```

---

### Task 13: Search components

**Files:**
- Create: `src/components/Search/SearchBar.tsx`
- Create: `src/components/Search/SearchResults.tsx`

- [ ] **Step 1: Create src/components/Search/SearchBar.tsx**

```tsx
import { useState, useCallback } from 'react'
import { searchTracks } from '../../services/youtube'
import { debounce } from '../../utils/helpers'
import type { YouTubeSearchResult } from '../../types'

interface Props {
  onResults: (results: YouTubeSearchResult[]) => void
  onLoading: (loading: boolean) => void
}

export default function SearchBar({ onResults, onLoading }: Props) {
  const [query, setQuery] = useState('')

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        onResults([])
        onLoading(false)
        return
      }
      onLoading(true)
      try {
        const results = await searchTracks(q)
        onResults(results)
      } catch {
        onResults([])
      } finally {
        onLoading(false)
      }
    }, 300),
    [onResults, onLoading],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    doSearch(val)
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search songs, artists..."
        value={query}
        onChange={handleChange}
        className="search-input"
        aria-label="Search"
      />
    </div>
  )
}
```

- [ ] **Step 2: Create src/components/Search/SearchResults.tsx**

```tsx
import { usePlayerStore } from '../../store/playerStore'
import type { YouTubeSearchResult } from '../../types'

interface Props {
  results: YouTubeSearchResult[]
  loading: boolean
}

export default function SearchResults({ results, loading }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  if (loading) return <div className="search-loading">Searching...</div>
  if (results.length === 0) return null

  const tracks = results.map((r) => ({
    id: r.videoId,
    videoId: r.videoId,
    title: r.title,
    artist: r.artist,
    thumbnail: r.thumbnail,
    duration: 0,
  }))

  return (
    <div className="search-results">
      {results.map((r) => (
        <div
          key={r.videoId}
          className="track-item"
          onDoubleClick={() => {
            setQueue(tracks, results.indexOf(r))
            togglePlay()
          }}
        >
          <img className="track-thumb" src={r.thumbnail} alt="" />
          <div className="track-info">
            <div className="track-title">{r.title}</div>
            <div className="track-artist">{r.artist}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
```

---

### Task 14: Pages

**Files:**
- Create: `src/pages/Home.tsx`
- Create: `src/pages/SearchPage.tsx`
- Create: `src/pages/PlaylistPage.tsx`
- Create: `src/pages/Library.tsx`

- [ ] **Step 1: Create src/pages/Home.tsx**

```tsx
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'
import { useMemo } from 'react'

export default function Home() {
  const playlists = usePlayerStore((s) => s.playlists)

  const recentPlaylists = useMemo(() => playlists.slice(0, 4), [playlists])

  return (
    <div className="page home-page">
      <h1 className="greeting">Good evening</h1>
      {playlists.length > 0 && (
        <PlaylistGrid playlists={recentPlaylists} title="Your Playlists" />
      )}
      {playlists.length === 0 && (
        <div className="empty-state">
          <p>Connect your Google account to import your YouTube Music playlists.</p>
          <a href={getAuthUrl()} className="btn-primary">
            Sign in with Google
          </a>
        </div>
      )}
    </div>
  )
}

function getAuthUrl() {
  const CLIENT_ID = ''
  const REDIRECT_URI = `${window.location.origin}/oauth-callback`
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'token',
    scope: 'https://www.googleapis.com/auth/youtube.readonly',
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}
```

- [ ] **Step 2: Create src/pages/SearchPage.tsx**

```tsx
import { useState } from 'react'
import SearchBar from '../components/Search/SearchBar'
import SearchResults from '../components/Search/SearchResults'
import type { YouTubeSearchResult } from '../types'

export default function SearchPage() {
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  return (
    <div className="page search-page">
      <h1 className="page-title">Search</h1>
      <SearchBar onResults={setResults} onLoading={setLoading} />
      <SearchResults results={results} loading={loading} />
    </div>
  )
}
```

- [ ] **Step 3: Create src/pages/PlaylistPage.tsx**

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../store/playerStore'
import PlaylistView from '../components/Playlist/PlaylistView'

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const playlists = usePlayerStore((s) => s.playlists)
  const navigate = useNavigate()

  const playlist = playlists.find((p) => p.id === id)

  if (!playlist) {
    return (
      <div className="page">
        <p>Playlist not found.</p>
        <button onClick={() => navigate('/')} className="btn-primary">
          Back to Home
        </button>
      </div>
    )
  }

  return (
    <div className="page">
      <PlaylistView playlist={playlist} />
    </div>
  )
}
```

- [ ] **Step 4: Create src/pages/Library.tsx**

```tsx
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'
import { isAuthenticated, getAuthUrl, logout } from '../services/auth'

export default function Library() {
  const playlists = usePlayerStore((s) => s.playlists)

  return (
    <div className="page library-page">
      <div className="library-header">
        <h1 className="page-title">Your Library</h1>
        {isAuthenticated() ? (
          <button onClick={logout} className="btn-secondary">
            Disconnect
          </button>
        ) : (
          <a href={getAuthUrl()} className="btn-primary">
            Import YouTube Music
          </a>
        )}
      </div>
      <PlaylistGrid playlists={playlists} />
    </div>
  )
}
```

---

### Task 15: App routing & main app

**Files:**
- Create: `src/App.tsx`
- Modify: `src/main.tsx` (if not already correct from Task 1)

- [ ] **Step 1: Create src/App.tsx**

```tsx
import { Routes, Route, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import SearchPage from './pages/SearchPage'
import PlaylistPage from './pages/PlaylistPage'
import Library from './pages/Library'
import { handleRedirectCallback } from './services/auth'
import { fetchUserPlaylists } from './services/youtube'
import { usePlayerStore } from './store/playerStore'
import { getAccessToken } from './services/auth'

export default function App() {
  const setPlaylists = usePlayerStore((s) => s.setPlaylists)
  const navigate = useNavigate()

  useEffect(() => {
    const token = handleRedirectCallback()
    if (token) {
      navigate('/library', { replace: true })
    }
  }, [navigate])

  useEffect(() => {
    const token = getAccessToken()
    if (token) {
      fetchUserPlaylists(token)
        .then(setPlaylists)
        .catch(() => {})
    }
  }, [setPlaylists])

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="library" element={<Library />} />
      </Route>
    </Routes>
  )
}
```

---

### Task 16: Global CSS — Tesla dark theme

**Files:**
- Create: `src/index.css`

- [ ] **Step 1: Create src/index.css**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg-base: #121212;
  --bg-elevated: #181818;
  --bg-highlight: #282828;
  --bg-sidebar: #000000;
  --text-primary: #ffffff;
  --text-secondary: #b3b3b3;
  --text-subtle: #727272;
  --accent: #1ed760;
  --accent-hover: #1fdf64;
  --border: #333333;
  --radius: 8px;
  --sidebar-width: 240px;
  --npb-height: 80px;
  --transition: 200ms ease;
}

html, body, #root {
  height: 100%;
  background: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

a { color: inherit; text-decoration: none; }
button { border: none; background: none; cursor: pointer; color: inherit; }
button:disabled { opacity: 0.4; cursor: not-allowed; }
input { border: none; outline: none; background: none; color: inherit; }

/* Layout */
.layout {
  display: flex;
  height: 100vh;
  flex-direction: column;
}

.main-content {
  flex: 1;
  margin-left: var(--sidebar-width);
  overflow-y: auto;
  padding: 24px;
  padding-bottom: calc(var(--npb-height) + 24px);
}

/* Sidebar */
.sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: var(--sidebar-width);
  height: 100%;
  background: var(--bg-sidebar);
  padding: 24px 12px;
  display: flex;
  flex-direction: column;
  z-index: 10;
}

.sidebar-logo {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
  padding: 0 12px;
  margin-bottom: 24px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  transition: all var(--transition);
  font-size: 14px;
  font-weight: 600;
}

.nav-item:hover { color: var(--text-primary); }
.nav-item.active { color: var(--text-primary); background: var(--bg-highlight); }

.nav-icon { font-size: 20px; }

.sidebar-divider {
  height: 1px;
  background: var(--border);
  margin: 16px 12px;
}

.sidebar-playlists {
  flex: 1;
  overflow-y: auto;
}

.sidebar-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
  padding: 0 12px;
  margin-bottom: 8px;
}

.playlist-link {
  display: block;
  padding: 8px 12px;
  border-radius: var(--radius);
  color: var(--text-secondary);
  font-size: 13px;
  transition: all var(--transition);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-link:hover { color: var(--text-primary); }
.playlist-link.active { color: var(--text-primary); background: var(--bg-highlight); }

/* Now Playing Bar */
.now-playing-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: var(--npb-height);
  background: var(--bg-elevated);
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  padding: 0 16px;
  z-index: 20;
}

.npb-left {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 30%;
  min-width: 200px;
}

.npb-cover {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
}

.npb-info {
  overflow: hidden;
}

.npb-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.npb-artist {
  font-size: 11px;
  color: var(--text-secondary);
}

.npb-like {
  font-size: 16px;
  color: var(--text-secondary);
  transition: color var(--transition);
}

.npb-like.liked { color: var(--accent); }

.npb-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  max-width: 600px;
}

.npb-right {
  width: 30%;
  display: flex;
  justify-content: flex-end;
  align-items: center;
  min-width: 150px;
}

/* Player Controls */
.player-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.control-btn {
  font-size: 16px;
  color: var(--text-secondary);
  transition: all var(--transition);
  padding: 4px;
}

.control-btn:hover { color: var(--text-primary); }
.control-btn.active { color: var(--accent); }

.play-btn {
  font-size: 28px;
  color: var(--text-primary);
}

/* Progress Bar */
.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.progress-time {
  font-size: 11px;
  color: var(--text-subtle);
  min-width: 40px;
  text-align: center;
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--text-subtle);
  border-radius: 2px;
  cursor: pointer;
  position: relative;
}

.progress-bar:hover { height: 6px; }

.progress-fill {
  height: 100%;
  background: var(--text-primary);
  border-radius: 2px;
  transition: width 100ms linear;
}

.progress-bar:hover .progress-fill { background: var(--accent); }

/* Volume Control */
.volume-control {
  display: flex;
  align-items: center;
  gap: 8px;
}

.volume-slider {
  position: relative;
  width: 100px;
  height: 4px;
  background: var(--text-subtle);
  border-radius: 2px;
}

.volume-fill {
  height: 100%;
  background: var(--text-primary);
  border-radius: 2px;
  pointer-events: none;
}

.volume-range {
  position: absolute;
  top: -8px;
  left: 0;
  width: 100%;
  height: 20px;
  opacity: 0;
  cursor: pointer;
}

/* Page Styles */
.page {
  animation: fadeIn 200ms ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.greeting {
  font-size: 32px;
  font-weight: 700;
  margin-bottom: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 24px;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 16px;
}

/* Playlist Grid */
.playlist-grid-section {
  margin-bottom: 32px;
}

.playlist-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
}

.playlist-card {
  background: var(--bg-elevated);
  border-radius: var(--radius);
  padding: 16px;
  cursor: pointer;
  transition: background var(--transition);
}

.playlist-card:hover { background: var(--bg-highlight); }

.playlist-card-image {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 12px;
}

.playlist-card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.playlist-card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.playlist-card-desc {
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Playlist View */
.playlist-view-header {
  display: flex;
  gap: 24px;
  margin-bottom: 32px;
  align-items: flex-end;
}

.playlist-view-cover {
  width: 200px;
  height: 200px;
  border-radius: 4px;
  object-fit: cover;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
}

.playlist-view-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.playlist-view-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-secondary);
}

.playlist-view-title {
  font-size: 36px;
  font-weight: 700;
  line-height: 1.1;
}

.playlist-view-desc {
  font-size: 14px;
  color: var(--text-secondary);
}

.play-all-btn {
  background: var(--accent);
  color: #000;
  font-weight: 700;
  padding: 10px 28px;
  border-radius: 24px;
  font-size: 14px;
  transition: background var(--transition);
  width: fit-content;
}

.play-all-btn:hover { background: var(--accent-hover); }

/* Track Item */
.track-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  border-radius: var(--radius);
  transition: background var(--transition);
  cursor: default;
}

.track-item:hover { background: var(--bg-highlight); }
.track-item.active { background: var(--bg-highlight); }
.track-item.active .col-num,
.track-item.active .col-title,
.track-item.active .col-artist { color: var(--accent); }

.col-num {
  width: 24px;
  text-align: right;
  font-size: 14px;
  color: var(--text-subtle);
}

.col-title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  font-weight: 600;
  overflow: hidden;
}

.track-thumb {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
}

.col-artist {
  width: 200px;
  font-size: 13px;
  color: var(--text-secondary);
}

.col-duration {
  width: 60px;
  text-align: right;
  font-size: 13px;
  color: var(--text-subtle);
}

.playlist-tracks-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--text-subtle);
}

/* Search */
.search-bar {
  margin-bottom: 24px;
}

.search-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 16px;
  background: var(--bg-highlight);
  border-radius: 24px;
  color: var(--text-primary);
  transition: all var(--transition);
}

.search-input:focus {
  background: var(--bg-elevated);
  outline: 2px solid var(--text-primary);
}

.search-loading {
  color: var(--text-secondary);
  padding: 16px 0;
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-results .track-item {
  cursor: pointer;
}

.track-info {
  flex: 1;
}

.track-title {
  font-size: 14px;
  font-weight: 600;
}

.track-artist {
  font-size: 12px;
  color: var(--text-secondary);
}

/* Library */
.library-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.library-header .page-title { margin-bottom: 0; }

/* Buttons */
.btn-primary {
  display: inline-block;
  background: var(--accent);
  color: #000;
  font-weight: 700;
  padding: 12px 28px;
  border-radius: 24px;
  font-size: 14px;
  transition: background var(--transition);
}

.btn-primary:hover { background: var(--accent-hover); }

.btn-secondary {
  display: inline-block;
  background: transparent;
  color: var(--text-secondary);
  font-weight: 600;
  padding: 8px 20px;
  border-radius: 24px;
  font-size: 13px;
  border: 1px solid var(--border);
  transition: all var(--transition);
}

.btn-secondary:hover {
  border-color: var(--text-primary);
  color: var(--text-primary);
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 64px 0;
  text-align: center;
  color: var(--text-secondary);
}

/* Spinner */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 600ms linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Scrollbar */
.main-content::-webkit-scrollbar {
  width: 8px;
}

.main-content::-webkit-scrollbar-track {
  background: transparent;
}

.main-content::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 4px;
}
```
---

### Task 17: OAuth callback page

**Files:**
- Create: `src/pages/OAuthCallback.tsx`

- [ ] **Step 1: Create src/pages/OAuthCallback.tsx**

This page is handled by the `handleRedirectCallback` in `App.tsx`. The OAuth redirect with `response_type=token` sends the token via URL hash fragment. The App.tsx already detects and processes this on mount. No additional route is needed — the redirect lands on `/oauth-callback` which falls under `Layout`, but we need a route or redirect.

Update `src/App.tsx` to handle the OAuth callback path:

```tsx
<Route path="oauth-callback" element={<OAuthCallback />} />
```

And create the component:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { handleRedirectCallback } from '../services/auth'
import { fetchUserPlaylists } from '../services/youtube'
import { usePlayerStore } from '../store/playerStore'
import Spinner from '../components/common/Spinner'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const setPlaylists = usePlayerStore((s) => s.setPlaylists)

  useEffect(() => {
    const token = handleRedirectCallback()
    if (token) {
      fetchUserPlaylists(token)
        .then(setPlaylists)
        .catch(() => {})
        .finally(() => navigate('/library', { replace: true }))
    } else {
      navigate('/', { replace: true })
    }
  }, [navigate, setPlaylists])

  return (
    <div className="page" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <Spinner />
    </div>
  )
}
```

---

### Self-review checklist

1. **Spec coverage:** All spec items are covered — types (Task 2), store (Task 3), YouTube service (Task 4), SponsorBlock (Task 5), Auth (Task 6), Layout/UI (Tasks 9-16), pages (Task 14), routing (Task 15), styling (Task 16).
2. **Placeholder scan:** The auth client ID in `src/services/auth.ts` and `src/pages/Home.tsx` is intentionally left empty (user must configure their own Google Cloud API credentials). All other code is complete.
3. **Type consistency:** All types from `src/types/index.ts` are used consistently across services, store, and components.
4. **No missing tasks:** Everything from the spec has a corresponding task.
{% endraw %}

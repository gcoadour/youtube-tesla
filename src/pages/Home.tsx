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
          <p>No playlists yet.</p>
          <p>Go to Your Library to import a YouTube playlist by URL, or search for music.</p>
        </div>
      )}
    </div>
  )
}

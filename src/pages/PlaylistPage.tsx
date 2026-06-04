import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../store/playerStore'
import { fetchPlaylistById } from '../services/youtube'
import PlaylistView from '../components/Playlist/PlaylistView'

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const playlists = usePlayerStore((s) => s.playlists)
  const updatePlaylistTracks = usePlayerStore((s) => s.updatePlaylistTracks)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attemptedKey = useRef(0)
  const [retryKey, setRetryKey] = useState(0)

  const storePlaylist = playlists.find((p) => p.id === id)

  useEffect(() => {
    if (!storePlaylist || !id) return
    if (storePlaylist.source !== 'youtube') return
    if (storePlaylist.tracks.length > 0) return
    if (attemptedKey.current === retryKey + 1) return

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchPlaylistById(id)
      .then((full) => {
        if (cancelled) return
        updatePlaylistTracks(id, full.tracks)
        setLoading(false)
        attemptedKey.current = retryKey + 1
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load playlist')
        setLoading(false)
        attemptedKey.current = retryKey + 1
      })

    return () => { cancelled = true }
  }, [id, storePlaylist, updatePlaylistTracks, retryKey])

  const playlist = storePlaylist
    ? { ...storePlaylist, tracks: storePlaylist.tracks }
    : null

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

  if (loading) {
    return (
      <div className="page">
        <div className="playlist-view">
          <div className="playlist-view-header">
            <img className="playlist-view-cover" src={playlist.thumbnail} alt={playlist.title} />
            <div className="playlist-view-meta">
              <div className="playlist-view-label">PLAYLIST</div>
              <h1 className="playlist-view-title">{playlist.title}</h1>
              <p className="playlist-view-desc">{playlist.description}</p>
            </div>
          </div>
          <div className="playlist-loading">
            <p>Loading tracks...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="playlist-view">
          <div className="playlist-view-header">
            <img className="playlist-view-cover" src={playlist.thumbnail} alt={playlist.title} />
            <div className="playlist-view-meta">
              <div className="playlist-view-label">PLAYLIST</div>
              <h1 className="playlist-view-title">{playlist.title}</h1>
              <p className="playlist-view-desc">{playlist.description}</p>
            </div>
          </div>
          <div className="playlist-error">
            <p>Failed to load tracks: {error}</p>
            <button onClick={() => setRetryKey(k => k + 1)} className="btn-primary">
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <PlaylistView playlist={playlist} />
    </div>
  )
}

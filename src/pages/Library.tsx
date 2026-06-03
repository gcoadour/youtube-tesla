import { useState } from 'react'
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'
import { fetchPlaylistById, parsePlaylistId } from '../services/youtube'

export default function Library() {
  const playlists = usePlayerStore((s) => s.playlists)
  const addPlaylist = usePlayerStore((s) => s.addPlaylist)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleImport = async () => {
    setError('')
    const id = parsePlaylistId(url)
    if (!id) {
      setError('Invalid YouTube playlist URL or ID')
      return
    }
    setLoading(true)
    try {
      const playlist = await fetchPlaylistById(id)
      addPlaylist(playlist)
      setUrl('')
    } catch {
      setError('Failed to import playlist')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page library-page">
      <div className="library-header">
        <h1 className="page-title">Your Library</h1>
      </div>

      <div className="playlist-import">
        <input
          type="text"
          placeholder="Paste YouTube playlist URL or ID..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="search-input"
          onKeyDown={(e) => e.key === 'Enter' && handleImport()}
        />
        <button
          className="btn-primary"
          onClick={handleImport}
          disabled={loading || !url.trim()}
          style={{ marginLeft: 8 }}
        >
          {loading ? 'Importing...' : 'Import'}
        </button>
        {error && <p className="error-text">{error}</p>}
      </div>

      <PlaylistGrid playlists={playlists} />
    </div>
  )
}

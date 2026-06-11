import { useState, useEffect, useRef } from 'react'
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'
import { fetchPlaylistById, parsePlaylistId, resolveChannel, fetchChannelPlaylists } from '../services/youtube'

export default function Library() {
  const playlists = usePlayerStore((s) => s.playlists)
  const importedPlaylists = usePlayerStore((s) => s.importedPlaylists)
  const addPlaylist = usePlayerStore((s) => s.addPlaylist)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [channelInput, setChannelInput] = useState('')
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelError, setChannelError] = useState('')
  const [channelSuccess, setChannelSuccess] = useState('')
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (hasLoadedRef.current) return
    if (playlists.length > 0 || importedPlaylists.length === 0) {
      hasLoadedRef.current = true
      return
    }

    hasLoadedRef.current = true
    const load = async () => {
      for (const imp of importedPlaylists) {
        const exists = playlists.some((p) => p.id === imp.id)
        if (exists) continue
        try {
          const playlist = await fetchPlaylistById(imp.id)
          addPlaylist(playlist)
        } catch {
          // Skip failed imports silently
        }
      }
    }
    load()
  }, [importedPlaylists, playlists, addPlaylist])

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

  const handleChannelImport = async () => {
    setChannelError('')
    setChannelSuccess('')
    if (!channelInput.trim()) return
    setChannelLoading(true)
    try {
      const channel = await resolveChannel(channelInput.trim())
      if (!channel) {
        setChannelError('Could not find a YouTube channel matching that input')
        return
      }
      const channelPlaylists = await fetchChannelPlaylists(channel.channelId)
      if (channelPlaylists.length === 0) {
        setChannelError('No public playlists found for this channel')
        return
      }
      const existingIds = new Set(playlists.map((p) => p.id))
      let added = 0
      for (const pl of channelPlaylists) {
        if (!existingIds.has(pl.id)) {
          addPlaylist(pl)
          added++
        }
      }
      setChannelSuccess(`${added} playlists imported from ${channel.name}${added < channelPlaylists.length ? ` (${channelPlaylists.length - added} already in library)` : ''}`)
      setChannelInput('')
    } catch {
      setChannelError('Failed to fetch channel. Try again later.')
    } finally {
      setChannelLoading(false)
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

      <hr className="library-divider" />

      <div className="playlist-import">
        <input
          type="text"
          placeholder="Paste YouTube channel handle, URL, or name..."
          value={channelInput}
          onChange={(e) => setChannelInput(e.target.value)}
          className="search-input"
          onKeyDown={(e) => e.key === 'Enter' && handleChannelImport()}
        />
        <button
          className="btn-primary"
          onClick={handleChannelImport}
          disabled={channelLoading || !channelInput.trim()}
          style={{ marginLeft: 8 }}
        >
          {channelLoading ? 'Fetching...' : 'Import Channel'}
        </button>
        {channelError && <p className="error-text">{channelError}</p>}
        {channelSuccess && <p className="success-text">{channelSuccess}</p>}
      </div>

      <PlaylistGrid playlists={playlists} />
    </div>
  )
}

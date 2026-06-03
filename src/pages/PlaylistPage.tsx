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

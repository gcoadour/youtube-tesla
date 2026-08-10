import { useParams, useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../store/playerStore'
import PlaylistView from '../components/Playlist/PlaylistView'

export default function PlaylistPage() {
  const { id } = useParams<{ id: string }>()
  const playlists = usePlayerStore((s) => s.playlists)
  const hydrated = usePlayerStore((s) => s.hydrated)
  const navigate = useNavigate()

  const playlist = playlists.find((p) => p.id === id)

  // Sans cette attente, la page annonce « playlist introuvable » le temps que
  // la bibliothèque remonte d'IndexedDB.
  if (!hydrated) {
    return (
      <div className="page">
        <div className="search-status">
          <span className="spinner" />
          <span>Chargement…</span>
        </div>
      </div>
    )
  }

  if (!playlist) {
    return (
      <div className="page">
        <div className="empty-state">
          <p>Playlist introuvable.</p>
          <button onClick={() => navigate('/library')} className="btn-primary">
            Retour à la bibliothèque
          </button>
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

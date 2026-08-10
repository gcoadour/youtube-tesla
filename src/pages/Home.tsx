import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

export default function Home() {
  const playlists = usePlayerStore((s) => s.playlists)
  const hydrated = usePlayerStore((s) => s.hydrated)

  const recent = useMemo(() => playlists.slice(0, 8), [playlists])

  return (
    <div className="page home-page">
      <h1 className="greeting">{greeting()}</h1>

      {!hydrated ? (
        <div className="search-status">
          <span className="spinner" />
          <span>Chargement de la bibliothèque…</span>
        </div>
      ) : playlists.length > 0 ? (
        <PlaylistGrid playlists={recent} title="Vos playlists" />
      ) : (
        <div className="empty-state">
          <p>Aucune playlist pour le moment.</p>
          <p>Importez une playlist YouTube depuis votre bibliothèque, ou lancez une recherche.</p>
          <Link to="/library" className="btn-primary">Ouvrir ma bibliothèque</Link>
        </div>
      )}
    </div>
  )
}

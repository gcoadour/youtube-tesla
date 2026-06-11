import { useNavigate } from 'react-router-dom'
import { usePlayerStore } from '../../store/playerStore'
import type { Playlist } from '../../types'

interface Props {
  playlist: Playlist
}

export default function PlaylistCard({ playlist }: Props) {
  const navigate = useNavigate()
  const removePlaylist = usePlayerStore((s) => s.removePlaylist)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    removePlaylist(playlist.id)
  }

  return (
    <div className="playlist-card" onClick={() => navigate(`/playlist/${playlist.id}`)}>
      <div className="playlist-card-image">
        <img src={playlist.thumbnail} alt={playlist.title} />
        <button
          className="playlist-card-delete"
          onClick={handleDelete}
          aria-label="Remove playlist"
        >
          ×
        </button>
      </div>
      <div className="playlist-card-body">
        <div className="playlist-card-title">{playlist.title}</div>
        <div className="playlist-card-desc">{playlist.description}</div>
      </div>
    </div>
  )
}

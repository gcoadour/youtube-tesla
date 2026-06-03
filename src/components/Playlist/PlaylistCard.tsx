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

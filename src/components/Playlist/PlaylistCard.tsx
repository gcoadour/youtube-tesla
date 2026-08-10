import { useNavigate } from 'react-router-dom'
import type { Playlist } from '../../types'
import { TrashIcon, RefreshIcon } from '../common/Icons'

interface Props {
  playlist: Playlist
  /** En mode édition les actions sont visibles en permanence, sans survol. */
  editing?: boolean
  onDelete?: (id: string) => void
  onRefresh?: (id: string) => void
  refreshing?: boolean
}

export default function PlaylistCard({ playlist, editing, onDelete, onRefresh, refreshing }: Props) {
  const navigate = useNavigate()

  const count = playlist.tracks.length
  const subtitle = count > 0
    ? `${count} titre${count > 1 ? 's' : ''}`
    : 'Aucun titre chargé'

  return (
    <div className="playlist-card" onClick={() => navigate(`/playlist/${playlist.id}`)}>
      <div className="playlist-card-image">
        {playlist.thumbnail
          ? <img src={playlist.thumbnail} alt="" loading="lazy" />
          : null}
      </div>

      <div className="playlist-card-title">{playlist.title}</div>
      <div className="playlist-card-desc">{playlist.description || subtitle}</div>
      {count === 0 && <span className="playlist-card-badge">À actualiser</span>}

      {editing && (
        <div className="playlist-card-actions">
          {onRefresh && (
            <button
              className="playlist-card-action refresh"
              onClick={(e) => { e.stopPropagation(); onRefresh(playlist.id) }}
              disabled={refreshing}
              aria-label={`Actualiser ${playlist.title}`}
            >
              {refreshing ? <span className="spinner" /> : <RefreshIcon size={22} />}
            </button>
          )}
          {onDelete && (
            <button
              className="playlist-card-action"
              onClick={(e) => { e.stopPropagation(); onDelete(playlist.id) }}
              aria-label={`Supprimer ${playlist.title}`}
            >
              <TrashIcon size={22} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

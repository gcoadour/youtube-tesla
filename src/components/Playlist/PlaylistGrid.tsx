import type { Playlist } from '../../types'
import PlaylistCard from './PlaylistCard'

interface Props {
  playlists: Playlist[]
  title?: string
  editing?: boolean
  onDelete?: (id: string) => void
  onRefresh?: (id: string) => void
  refreshingId?: string | null
}

export default function PlaylistGrid({ playlists, title, editing, onDelete, onRefresh, refreshingId }: Props) {
  return (
    <section className="playlist-grid-section">
      {title && <h2 className="section-title">{title}</h2>}
      <div className="playlist-grid">
        {playlists.map((p) => (
          <PlaylistCard
            key={p.id}
            playlist={p}
            editing={editing}
            onDelete={onDelete}
            onRefresh={onRefresh}
            refreshing={refreshingId === p.id}
          />
        ))}
      </div>
    </section>
  )
}

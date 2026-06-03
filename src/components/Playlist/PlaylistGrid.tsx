import type { Playlist } from '../../types'
import PlaylistCard from './PlaylistCard'

interface Props {
  playlists: Playlist[]
  title?: string
}

export default function PlaylistGrid({ playlists, title }: Props) {
  return (
    <section className="playlist-grid-section">
      {title && <h2 className="section-title">{title}</h2>}
      <div className="playlist-grid">
        {playlists.map((p) => (
          <PlaylistCard key={p.id} playlist={p} />
        ))}
      </div>
    </section>
  )
}

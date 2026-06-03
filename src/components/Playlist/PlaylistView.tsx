import { usePlayerStore } from '../../store/playerStore'
import type { Playlist } from '../../types'
import TrackItem from '../common/TrackItem'

interface Props {
  playlist: Playlist
}

export default function PlaylistView({ playlist }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const handlePlayAll = () => {
    setQueue(playlist.tracks, 0)
    usePlayerStore.getState().play()
  }

  return (
    <div className="playlist-view">
      <div className="playlist-view-header">
        <img className="playlist-view-cover" src={playlist.thumbnail} alt={playlist.title} />
        <div className="playlist-view-meta">
          <div className="playlist-view-label">PLAYLIST</div>
          <h1 className="playlist-view-title">{playlist.title}</h1>
          <p className="playlist-view-desc">{playlist.description}</p>
          <button className="play-all-btn" onClick={handlePlayAll}>
            ▶ Play All
          </button>
        </div>
      </div>
      <div className="playlist-tracks">
        <div className="playlist-tracks-header">
          <span className="col-num">#</span>
          <span className="col-title">Title</span>
          <span className="col-artist">Artist</span>
          <span className="col-duration">Duration</span>
        </div>
        {playlist.tracks.map((track, i) => (
          <TrackItem
            key={track.id}
            track={track}
            index={i + 1}
            isActive={currentTrack?.id === track.id}
            onPlay={() => {
              setQueue(playlist.tracks, i)
              togglePlay()
            }}
          />
        ))}
      </div>
    </div>
  )
}

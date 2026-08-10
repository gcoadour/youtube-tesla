import { usePlayerStore } from '../../store/playerStore'
import type { Playlist } from '../../types'
import TrackItem from '../common/TrackItem'
import { PlayIcon, ShuffleIcon } from '../common/Icons'

interface Props {
  playlist: Playlist
}

export default function PlaylistView({ playlist }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const play = usePlayerStore((s) => s.play)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const startAt = (index: number) => {
    setQueue(playlist.tracks, index)
    // `play()` et non `togglePlay()` : sur une lecture en cours, toucher une
    // piste mettait le lecteur en pause au lieu de lancer la piste choisie.
    play()
  }

  const handleShufflePlay = () => {
    if (!shuffle) toggleShuffle()
    startAt(Math.floor(Math.random() * playlist.tracks.length))
  }

  const isEmpty = playlist.tracks.length === 0

  return (
    <div className="playlist-view">
      <div className="playlist-view-header">
        {playlist.thumbnail && (
          <img className="playlist-view-cover" src={playlist.thumbnail} alt="" />
        )}
        <div className="playlist-view-meta">
          <div className="playlist-view-label">Playlist</div>
          <h1 className="playlist-view-title">{playlist.title}</h1>
          {playlist.description && <p className="playlist-view-desc">{playlist.description}</p>}
          <p className="playlist-view-desc">
            {playlist.tracks.length} titre{playlist.tracks.length > 1 ? 's' : ''}
          </p>
          <div className="playlist-view-actions">
            <button className="btn-primary" onClick={() => startAt(0)} disabled={isEmpty}>
              <PlayIcon size={22} />
              <span style={{ marginLeft: 10 }}>Tout lire</span>
            </button>
            <button className="btn-secondary" onClick={handleShufflePlay} disabled={isEmpty}>
              <ShuffleIcon size={20} />
              <span style={{ marginLeft: 10 }}>Aléatoire</span>
            </button>
          </div>
        </div>
      </div>

      {isEmpty ? (
        <div className="empty-state">
          <p>Aucun titre n'a pu être chargé pour cette playlist.</p>
          <p>Utilisez « Actualiser » depuis la bibliothèque pour réessayer.</p>
        </div>
      ) : (
        <div className="playlist-tracks">
          <div className="playlist-tracks-header">
            <span className="col-num">#</span>
            <span className="col-title">Titre</span>
            <span className="col-artist">Artiste</span>
            <span className="col-duration">Durée</span>
          </div>
          {playlist.tracks.map((track, i) => (
            <TrackItem
              key={`${track.id}-${i}`}
              track={track}
              index={i + 1}
              isActive={currentTrack?.id === track.id}
              onPlay={() => startAt(i)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

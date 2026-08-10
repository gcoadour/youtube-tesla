import { usePlayerStore } from '../../store/playerStore'
import PlayerControls from './PlayerControls'
import ProgressBar from './ProgressBar'
import { ChevronDownIcon, HeartIcon, HeartOutlineIcon } from '../common/Icons'

interface Props {
  onClose: () => void
}

/**
 * Lecteur plein écran, pensé pour être piloté du bout du doigt en conduite :
 * grande pochette, contrôles surdimensionnés, barre de progression scrubable.
 */
export default function NowPlayingView({ onClose }: Props) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const likedTracks = usePlayerStore((s) => s.likedTracks)
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack)

  if (!currentTrack) return null

  const isLiked = likedTracks.has(currentTrack.id)

  return (
    <div className="now-playing-view">
      <div className="npv-header">
        <button className="npv-icon-btn" onClick={onClose} aria-label="Réduire le lecteur">
          <ChevronDownIcon size={30} />
        </button>
        <span className="npv-label">Lecture en cours</span>
        <button
          className={`npv-icon-btn ${isLiked ? 'liked' : ''}`}
          onClick={() => toggleLikeTrack(currentTrack.id)}
          aria-label={isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {isLiked ? <HeartIcon size={28} /> : <HeartOutlineIcon size={28} />}
        </button>
      </div>

      <div className="npv-body">
        <img className="npv-cover" src={currentTrack.thumbnail} alt="" />
        <div className="npv-main">
          <div>
            <h1 className="npv-title">{currentTrack.title}</h1>
            <p className="npv-artist">{currentTrack.artist}</p>
          </div>
          <ProgressBar />
          <div className="npv-controls">
            <PlayerControls size="full" />
          </div>
        </div>
      </div>
    </div>
  )
}

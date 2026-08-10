import type { CSSProperties } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import PlayerControls from '../Player/PlayerControls'
import ProgressBar from '../Player/ProgressBar'
import VolumeControl from '../Player/VolumeControl'
import { HeartIcon, HeartOutlineIcon, ExpandIcon } from '../common/Icons'

interface Props {
  onExpand: () => void
}

export default function NowPlayingBar({ onExpand }: Props) {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const likedTracks = usePlayerStore((s) => s.likedTracks)
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack)
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)

  if (!currentTrack) return null

  const isLiked = likedTracks.has(currentTrack.id)
  const percent = duration ? Math.min(100, (progress / duration) * 100) : 0

  return (
    <footer
      className="now-playing-bar"
      style={{ '--npb-progress': `${percent}%` } as CSSProperties}
    >
      <div className="npb-progress-track" />

      <div className="npb-left">
        {/* Pochette et titre forment une seule cible : sur téléphone, viser une
            vignette de 52 px du bout du pouce n'est pas réaliste. */}
        <button className="npb-open" onClick={onExpand} aria-label="Afficher le lecteur en plein écran">
          <span className="npb-cover-wrap">
            <img className="npb-cover" src={currentTrack.thumbnail} alt="" />
            <span className="npb-cover-expand"><ExpandIcon size={16} /></span>
          </span>
          <span className="npb-info">
            <span className="npb-title">{currentTrack.title}</span>
            <span className="npb-artist">{currentTrack.artist}</span>
          </span>
        </button>
        <button
          className={`npb-like ${isLiked ? 'liked' : ''}`}
          onClick={() => toggleLikeTrack(currentTrack.id)}
          aria-label={isLiked ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {isLiked ? <HeartIcon size={24} /> : <HeartOutlineIcon size={24} />}
        </button>
      </div>

      <div className="npb-center">
        <PlayerControls />
        <ProgressBar />
      </div>

      <div className="npb-right">
        <VolumeControl />
      </div>
    </footer>
  )
}

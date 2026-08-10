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
        <button className="npb-cover-btn" onClick={onExpand} aria-label="Afficher le lecteur en plein écran">
          <img className="npb-cover" src={currentTrack.thumbnail} alt="" />
          <span className="npb-cover-expand"><ExpandIcon size={16} /></span>
        </button>
        <div className="npb-info">
          <div className="npb-title">{currentTrack.title}</div>
          <div className="npb-artist">{currentTrack.artist}</div>
        </div>
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

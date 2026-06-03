import { usePlayerStore } from '../../store/playerStore'
import PlayerControls from '../Player/PlayerControls'
import ProgressBar from '../Player/ProgressBar'
import VolumeControl from '../Player/VolumeControl'
import { HeartIcon, HeartOutlineIcon } from '../common/Icons'

export default function NowPlayingBar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack)
  const likedTracks = usePlayerStore((s) => s.likedTracks)
  const toggleLikeTrack = usePlayerStore((s) => s.toggleLikeTrack)

  if (!currentTrack) return null

  const isLiked = likedTracks.has(currentTrack.id)

  return (
    <footer className="now-playing-bar">
      <div className="npb-left">
        <img
          className="npb-cover"
          src={currentTrack.thumbnail}
          alt={currentTrack.title}
        />
        <div className="npb-info">
          <div className="npb-title">{currentTrack.title}</div>
          <div className="npb-artist">{currentTrack.artist}</div>
        </div>
        <button
          className={`npb-like ${isLiked ? 'liked' : ''}`}
          onClick={() => toggleLikeTrack(currentTrack.id)}
          aria-label={isLiked ? 'Unlike' : 'Like'}
        >
          {isLiked ? <HeartIcon size={18} /> : <HeartOutlineIcon size={18} />}
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

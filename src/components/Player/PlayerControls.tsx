import { usePlayerStore } from '../../store/playerStore'
import { PlayIcon, PauseIcon, SkipPrevIcon, SkipNextIcon, ShuffleIcon, RepeatIcon, RepeatOneIcon } from '../common/Icons'

export default function PlayerControls() {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  return (
    <div className="player-controls">
      <button
        className={`control-btn ${shuffle ? 'active' : ''}`}
        onClick={toggleShuffle}
        aria-label="Shuffle"
      >
        <ShuffleIcon size={20} />
      </button>
      <button
        className="control-btn"
        onClick={previous}
        disabled={!currentTrack}
        aria-label="Previous"
      >
        <SkipPrevIcon size={20} />
      </button>
      <button
        className="control-btn play-btn"
        onClick={togglePlay}
        disabled={!currentTrack}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
      </button>
      <button
        className="control-btn"
        onClick={next}
        disabled={!currentTrack}
        aria-label="Next"
      >
        <SkipNextIcon size={20} />
      </button>
      <button
        className={`control-btn ${repeat !== 'off' ? 'active' : ''}`}
        onClick={toggleRepeat}
        aria-label="Repeat"
      >
        {repeat === 'one' ? <RepeatOneIcon size={20} /> : <RepeatIcon size={20} />}
      </button>
    </div>
  )
}

import { usePlayerStore } from '../../store/playerStore'
import {
  PlayIcon, PauseIcon, SkipPrevIcon, SkipNextIcon,
  ShuffleIcon, RepeatIcon, RepeatOneIcon,
} from '../common/Icons'

interface Props {
  /** La vue plein écran utilise des contrôles plus grands. */
  size?: 'bar' | 'full'
}

export default function PlayerControls({ size = 'bar' }: Props) {
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const isLoading = usePlayerStore((s) => s.isLoading)
  const togglePlay = usePlayerStore((s) => s.togglePlay)
  const next = usePlayerStore((s) => s.next)
  const previous = usePlayerStore((s) => s.previous)
  const shuffle = usePlayerStore((s) => s.shuffle)
  const toggleShuffle = usePlayerStore((s) => s.toggleShuffle)
  const repeat = usePlayerStore((s) => s.repeat)
  const toggleRepeat = usePlayerStore((s) => s.toggleRepeat)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  const icon = size === 'full' ? 30 : 24
  const playIcon = size === 'full' ? 44 : 32

  const repeatLabel =
    repeat === 'one' ? 'Répéter : piste courante' : repeat === 'all' ? 'Répéter : toute la file' : 'Répétition désactivée'

  return (
    <div className="player-controls">
      <button
        className={`control-btn control-shuffle ${shuffle ? 'active' : ''}`}
        onClick={toggleShuffle}
        aria-label={shuffle ? 'Désactiver la lecture aléatoire' : 'Activer la lecture aléatoire'}
        aria-pressed={shuffle}
      >
        <ShuffleIcon size={icon} />
      </button>

      <button
        className="control-btn control-prev"
        onClick={previous}
        disabled={!currentTrack}
        aria-label="Piste précédente"
      >
        <SkipPrevIcon size={icon} />
      </button>

      <button
        className="control-btn play-btn"
        onClick={togglePlay}
        disabled={!currentTrack}
        aria-label={isPlaying ? 'Pause' : 'Lecture'}
      >
        {isLoading ? (
          <span className="spinner" />
        ) : isPlaying ? (
          <PauseIcon size={playIcon} />
        ) : (
          <PlayIcon size={playIcon} />
        )}
      </button>

      <button
        className="control-btn control-next"
        onClick={() => next()}
        disabled={!currentTrack}
        aria-label="Piste suivante"
      >
        <SkipNextIcon size={icon} />
      </button>

      <button
        className={`control-btn control-repeat ${repeat !== 'off' ? 'active' : ''}`}
        onClick={toggleRepeat}
        aria-label={repeatLabel}
        title={repeatLabel}
      >
        {repeat === 'one' ? <RepeatOneIcon size={icon} /> : <RepeatIcon size={icon} />}
      </button>
    </div>
  )
}

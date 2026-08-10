import { usePlayerStore } from '../../store/playerStore'
import { VolumeHighIcon, VolumeMediumIcon, VolumeOffIcon } from '../common/Icons'

export default function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)

  const effective = isMuted ? 0 : volume

  return (
    <div className="volume-control">
      <button
        className="control-btn"
        onClick={toggleMute}
        aria-label={isMuted ? 'Rétablir le son' : 'Couper le son'}
      >
        {effective === 0 ? <VolumeOffIcon size={24} />
          : effective < 0.5 ? <VolumeMediumIcon size={24} />
          : <VolumeHighIcon size={24} />}
      </button>
      <div className="volume-slider">
        <div className="volume-track">
          <div className="volume-fill" style={{ width: `${effective * 100}%` }} />
        </div>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={effective}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="volume-range"
          aria-label="Volume"
        />
      </div>
    </div>
  )
}

import { usePlayerStore } from '../../store/playerStore'
import { VolumeHighIcon, VolumeMediumIcon, VolumeOffIcon } from '../common/Icons'

export default function VolumeControl() {
  const volume = usePlayerStore((s) => s.volume)
  const isMuted = usePlayerStore((s) => s.isMuted)
  const setVolume = usePlayerStore((s) => s.setVolume)
  const toggleMute = usePlayerStore((s) => s.toggleMute)

  return (
    <div className="volume-control">
      <button className="control-btn" onClick={toggleMute} aria-label="Mute">
        {isMuted || volume === 0 ? <VolumeOffIcon size={20} /> : volume < 0.5 ? <VolumeMediumIcon size={20} /> : <VolumeHighIcon size={20} />}
      </button>
      <div className="volume-slider">
        <div
          className="volume-fill"
          style={{ width: `${(isMuted ? 0 : volume) * 100}%` }}
        />
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={isMuted ? 0 : volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="volume-range"
          aria-label="Volume"
        />
      </div>
    </div>
  )
}

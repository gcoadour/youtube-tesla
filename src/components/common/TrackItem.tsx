import type { Track } from '../../types'
import { formatDuration } from '../../services/youtube'

interface Props {
  track: Track
  index: number
  isActive: boolean
  onPlay: () => void
}

export default function TrackItem({ track, index, isActive, onPlay }: Props) {
  return (
    <div
      className={`track-item ${isActive ? 'active' : ''}`}
      onClick={onPlay}
    >
      <span className="col-num">{index}</span>
      <div className="col-title">
        <img className="track-thumb" src={track.thumbnail} alt="" />
        <span>{track.title}</span>
      </div>
      <span className="col-artist">{track.artist}</span>
      <span className="col-duration">{formatDuration(track.duration)}</span>
    </div>
  )
}

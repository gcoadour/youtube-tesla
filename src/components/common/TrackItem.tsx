import { useEffect, useState } from 'react'
import type { Track } from '../../types'
import { formatDuration } from '../../services/youtube'
import { isCached as checkCached } from '../../services/audioCache'

interface Props {
  track: Track
  index: number
  isActive: boolean
  onPlay: () => void
}

export default function TrackItem({ track, index, isActive, onPlay }: Props) {
  const [cached, setCached] = useState(false)

  useEffect(() => {
    checkCached(track.videoId).then(setCached)
  }, [track.videoId])

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
      <span className="col-actions">
        {cached && <span className="cache-indicator" title="Disponible hors ligne" />}
        <span className="col-duration">{formatDuration(track.duration)}</span>
      </span>
    </div>
  )
}

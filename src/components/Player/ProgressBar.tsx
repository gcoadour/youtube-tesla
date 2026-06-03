import { useRef, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { formatDuration } from '../../services/youtube'

export default function ProgressBar() {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const barRef = useRef<HTMLDivElement>(null)

  const seekTo = usePlayerStore((s) => s.seekTo)

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!barRef.current || !duration) return
      const rect = barRef.current.getBoundingClientRect()
      const ratio = (e.clientX - rect.left) / rect.width
      const time = ratio * duration
      seekTo(time)
    },
    [duration, seekTo],
  )

  const percent = duration ? (progress / duration) * 100 : 0

  return (
    <div className="progress-bar-container">
      <span className="progress-time">{formatDuration(progress)}</span>
      <div className="progress-bar" ref={barRef} onClick={handleClick}>
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-time">{formatDuration(duration)}</span>
    </div>
  )
}

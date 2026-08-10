import { useRef, useState, useCallback } from 'react'
import { usePlayerStore } from '../../store/playerStore'
import { formatDuration } from '../../services/youtube'

/**
 * Barre de progression scrubable.
 *
 * La version précédente n'écoutait que `click` et `touchstart` : impossible de
 * faire glisser. Les Pointer Events couvrent souris et doigt avec un seul jeu de
 * gestionnaires, et `setPointerCapture` garde le suivi même si le doigt sort de
 * la barre — indispensable sur une cible étroite dans un véhicule.
 */
export default function ProgressBar() {
  const progress = usePlayerStore((s) => s.progress)
  const duration = usePlayerStore((s) => s.duration)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const setScrubbing = usePlayerStore((s) => s.setScrubbing)

  const barRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [dragValue, setDragValue] = useState(0)

  const ratioAt = useCallback((clientX: number): number => {
    const el = barRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    setScrubbing(true)
    setDragValue(ratioAt(e.clientX) * duration)
  }, [duration, ratioAt, setScrubbing])

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !duration) return
    setDragValue(ratioAt(e.clientX) * duration)
  }, [dragging, duration, ratioAt])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !duration) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    seekTo(ratioAt(e.clientX) * duration)
    setDragging(false)
    setScrubbing(false)
  }, [dragging, duration, ratioAt, seekTo, setScrubbing])

  // Pendant le glissement l'affichage suit le doigt, pas l'élément audio.
  const displayed = dragging ? dragValue : progress
  const percent = duration ? Math.min(100, (displayed / duration) * 100) : 0

  return (
    <div className="progress-bar-container">
      <span className="progress-time">{formatDuration(displayed)}</span>
      <div
        className={`progress-bar ${dragging ? 'scrubbing' : ''}`}
        ref={barRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="slider"
        aria-label="Position de lecture"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(displayed)}
        aria-valuetext={formatDuration(displayed)}
        tabIndex={0}
      >
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${percent}%` }} />
          <div className="progress-thumb" style={{ left: `${percent}%` }} />
        </div>
      </div>
      <span className="progress-time">{formatDuration(duration)}</span>
    </div>
  )
}

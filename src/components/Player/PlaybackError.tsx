import { usePlayerStore } from '../../store/playerStore'
import { CloseIcon } from '../common/Icons'

/**
 * Rend visible l'échec de lecture. Auparavant l'erreur ne partait que dans la
 * console : côté conduite, l'application restait silencieuse sans explication.
 */
export default function PlaybackError() {
  const playbackError = usePlayerStore((s) => s.playbackError)
  const setPlaybackError = usePlayerStore((s) => s.setPlaybackError)

  if (!playbackError) return null

  return (
    <div className="playback-error" role="alert">
      <span>{playbackError}</span>
      <button
        className="playback-error-close"
        onClick={() => setPlaybackError(null)}
        aria-label="Fermer"
      >
        <CloseIcon size={22} />
      </button>
    </div>
  )
}

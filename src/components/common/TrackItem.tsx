import { useEffect, useState } from 'react'
import type { Track } from '../../types'
import { formatDuration } from '../../services/youtube'
import { isCached, cacheAudio, deleteAudio } from '../../services/audioCache'
import { getAudioBlob } from '../../services/player'
import { DownloadIcon, DownloadDoneIcon } from '../common/Icons'

interface Props {
  track: Track
  index: number
  isActive: boolean
  onPlay: () => void
  /** Masque la colonne numéro pour les listes sans ordre (résultats de recherche). */
  showIndex?: boolean
}

export default function TrackItem({ track, index, isActive, onPlay, showIndex = true }: Props) {
  const [cached, setCached] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    isCached(track.videoId).then((v) => { if (active) setCached(v) })
    return () => { active = false }
  }, [track.videoId])

  /**
   * Téléchargement explicite. La version précédente mettait en cache chaque
   * piste jouée automatiquement, ce qui saturait le stockage et consommait
   * la 4G du véhicule sans que l'utilisateur l'ait demandé.
   */
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    try {
      if (cached) {
        await deleteAudio(track.videoId)
        setCached(false)
      } else {
        await cacheAudio(track.videoId, await getAudioBlob(track.videoId))
        setCached(true)
      }
    } catch {
      // Le téléchargement a échoué : l'état du bouton reste inchangé.
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={`track-item ${isActive ? 'active' : ''}`}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onPlay() }}
    >
      {showIndex && <span className="col-num">{index}</span>}
      <div className="col-title">
        <img className="track-thumb" src={track.thumbnail} alt="" loading="lazy" />
        <span>{track.title}</span>
      </div>
      <span className="col-artist">{track.artist}</span>
      <span className="col-actions">
        <button
          className={`track-download ${cached ? 'cached' : ''}`}
          onClick={handleDownload}
          disabled={busy}
          aria-label={cached ? 'Retirer du hors ligne' : 'Télécharger pour le hors ligne'}
          title={cached ? 'Disponible hors ligne' : 'Télécharger pour le hors ligne'}
        >
          {busy ? <span className="spinner" /> : cached ? <DownloadDoneIcon size={22} /> : <DownloadIcon size={22} />}
        </button>
        <span className="col-duration">{track.duration ? formatDuration(track.duration) : '--:--'}</span>
      </span>
    </div>
  )
}

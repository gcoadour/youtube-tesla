import { usePlayerStore } from '../../store/playerStore'
import type { YouTubeSearchResult } from '../../types'
import TrackItem from '../common/TrackItem'

interface Props {
  results: YouTubeSearchResult[]
  loading: boolean
  error?: string
  searched: boolean
}

export default function SearchResults({ results, loading, error, searched }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const play = usePlayerStore((s) => s.play)
  const currentTrack = usePlayerStore((s) => s.currentTrack)

  if (loading) {
    return (
      <div className="search-status">
        <span className="spinner" />
        <span>Recherche en cours…</span>
      </div>
    )
  }

  if (error) return <div className="search-error">{error}</div>

  if (results.length === 0) {
    return searched ? <div className="search-status">Aucun résultat.</div> : null
  }

  // La durée renvoyée par la recherche est conservée : l'ancienne version la
  // remettait à 0, ce qui affichait « 0:00 » sur tous les résultats.
  const tracks = results.map((r) => ({
    id: r.videoId,
    videoId: r.videoId,
    title: r.title,
    artist: r.artist,
    thumbnail: r.thumbnail,
    duration: r.duration,
  }))

  return (
    <div className="search-results">
      {tracks.map((track, i) => (
        <TrackItem
          key={track.videoId}
          track={track}
          index={i + 1}
          showIndex={false}
          isActive={currentTrack?.id === track.id}
          onPlay={() => { setQueue(tracks, i); play() }}
        />
      ))}
    </div>
  )
}

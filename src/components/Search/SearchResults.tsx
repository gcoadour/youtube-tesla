import { usePlayerStore } from '../../store/playerStore'
import type { YouTubeSearchResult } from '../../types'

interface Props {
  results: YouTubeSearchResult[]
  loading: boolean
  error?: string
}

export default function SearchResults({ results, loading, error }: Props) {
  const setQueue = usePlayerStore((s) => s.setQueue)
  const togglePlay = usePlayerStore((s) => s.togglePlay)

  if (loading) return <div className="search-loading">Searching...</div>
  if (error) return <div className="search-error">{error}</div>
  if (results.length === 0) return null

  const tracks = results.map((r) => ({
    id: r.videoId,
    videoId: r.videoId,
    title: r.title,
    artist: r.artist,
    thumbnail: r.thumbnail,
    duration: 0,
  }))

  return (
    <div className="search-results">
      {results.map((r) => (
        <div
          key={r.videoId}
          className="track-item"
          onDoubleClick={() => {
            setQueue(tracks, results.indexOf(r))
            togglePlay()
          }}
        >
          <img className="track-thumb" src={r.thumbnail} alt="" />
          <div className="track-info">
            <div className="track-title">{r.title}</div>
            <div className="track-artist">{r.artist}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

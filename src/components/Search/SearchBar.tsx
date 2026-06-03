import { useState, useCallback } from 'react'
import { searchTracks } from '../../services/youtube'
import { debounce } from '../../utils/helpers'
import type { YouTubeSearchResult } from '../../types'
interface Props {
  onResults: (results: YouTubeSearchResult[]) => void
  onLoading: (loading: boolean) => void
  onError?: (error: string) => void
}

export default function SearchBar({ onResults, onLoading, onError }: Props) {
  const [query, setQuery] = useState('')

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) {
        onResults([])
        onLoading(false)
        return
      }
      onLoading(true)
      try {
        const results = await searchTracks(q)
        onResults(results)
        onError?.('')
      } catch {
        onResults([])
        onError?.('Search temporarily unavailable. Try again.')
      } finally {
        onLoading(false)
      }
    }, 300),
    [onResults, onLoading, onError],
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setQuery(val)
    doSearch(val)
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search songs, artists..."
        value={query}
        onChange={handleChange}
        className="search-input"
        aria-label="Search"
      />
    </div>
  )
}

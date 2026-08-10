import { useState, useMemo } from 'react'
import { searchTracks } from '../../services/youtube'
import { debounce } from '../../utils/helpers'
import type { YouTubeSearchResult } from '../../types'

interface Props {
  onResults: (results: YouTubeSearchResult[]) => void
  onLoading: (loading: boolean) => void
  onError: (error: string) => void
  onSearched: (searched: boolean) => void
}

export default function SearchBar({ onResults, onLoading, onError, onSearched }: Props) {
  const [query, setQuery] = useState('')

  const doSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        if (!q.trim()) {
          onResults([])
          onLoading(false)
          onSearched(false)
          onError('')
          return
        }
        onLoading(true)
        try {
          onResults(await searchTracks(q))
          onError('')
        } catch (err) {
          onResults([])
          onError(err instanceof Error ? err.message : 'Recherche indisponible. Réessayez.')
        } finally {
          onLoading(false)
          onSearched(true)
        }
      }, 350),
    [onResults, onLoading, onError, onSearched],
  )

  return (
    <div className="search-bar">
      <input
        type="search"
        placeholder="Rechercher un titre, un artiste…"
        value={query}
        onChange={(e) => { setQuery(e.target.value); doSearch(e.target.value) }}
        className="search-input"
        aria-label="Rechercher"
        autoComplete="off"
      />
    </div>
  )
}

import { useState, useMemo, useRef, useEffect } from 'react'
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

  /*
   * Chaque frappe peut lancer une cascade sur plusieurs instances, et rien ne
   * garantit que les réponses reviennent dans l'ordre. Sans ce compteur, une
   * requête ancienne et lente écrasait les résultats d'une plus récente, ou
   * remettait `loading` à false alors qu'une recherche était encore en cours.
   */
  const runIdRef = useRef(0)

  // Une réponse qui arrive après le démontage ne doit rien tenter d'afficher.
  useEffect(() => () => { runIdRef.current++ }, [])

  const doSearch = useMemo(
    () =>
      debounce(async (q: string) => {
        const runId = ++runIdRef.current
        const isStale = () => runId !== runIdRef.current

        if (!q.trim()) {
          onResults([])
          onLoading(false)
          onSearched(false)
          onError('')
          return
        }

        onLoading(true)
        try {
          const results = await searchTracks(q)
          if (isStale()) return
          onResults(results)
          onError('')
        } catch (err) {
          if (isStale()) return
          onResults([])
          onError(err instanceof Error ? err.message : 'Recherche indisponible. Réessayez.')
        } finally {
          if (!isStale()) {
            onLoading(false)
            onSearched(true)
          }
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

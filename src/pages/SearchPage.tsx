import { useState } from 'react'
import SearchBar from '../components/Search/SearchBar'
import SearchResults from '../components/Search/SearchResults'
import type { YouTubeSearchResult } from '../types'

export default function SearchPage() {
  const [results, setResults] = useState<YouTubeSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  return (
    <div className="page search-page">
      <h1 className="page-title">Search</h1>
      <SearchBar onResults={setResults} onLoading={setLoading} onError={setError} />
      <SearchResults results={results} loading={loading} error={error} />
    </div>
  )
}

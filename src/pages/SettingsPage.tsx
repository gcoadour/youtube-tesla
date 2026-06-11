import { useEffect, useState, useCallback } from 'react'
import { getCacheInfo, getAllCachedTracks, deleteAudio, clearCache as clearAllCache } from '../services/audioCache'

interface CachedEntry {
  videoId: string
  size: number
  cachedAt: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SettingsPage() {
  const [cacheInfo, setCacheInfo] = useState({ count: 0, totalSize: 0 })
  const [cachedTracks, setCachedTracks] = useState<CachedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const refreshCache = useCallback(async () => {
    setLoading(true)
    const [info, tracks] = await Promise.all([getCacheInfo(), getAllCachedTracks()])
    setCacheInfo(info)
    setCachedTracks(
      tracks.map((t) => ({ videoId: t.videoId, size: t.size, cachedAt: t.cachedAt }))
        .sort((a, b) => b.cachedAt - a.cachedAt)
    )
    setLoading(false)
  }, [])

  useEffect(() => { refreshCache() }, [refreshCache])

  const handleDelete = async (videoId: string) => {
    await deleteAudio(videoId)
    refreshCache()
  }

  const handleClearAll = async () => {
    await clearAllCache()
    setConfirmClear(false)
    refreshCache()
  }

  return (
    <div className="page settings-page">
      <h1 className="page-title">Settings</h1>

      <div className="settings-section">
        <h3>Offline Cache</h3>
        <p className="settings-desc">
          Tracks you play are automatically cached for offline listening.
        </p>
        {loading ? (
          <p className="settings-desc">Loading cache info...</p>
        ) : cacheInfo.count === 0 ? (
          <p className="settings-desc">No cached tracks yet. Play some music to build the cache.</p>
        ) : (
          <>
            <p className="settings-desc">
              <strong>{cacheInfo.count}</strong> track{cacheInfo.count > 1 ? 's' : ''} cached —
              <strong> {formatSize(cacheInfo.totalSize)}</strong>
            </p>
            <div className="cache-track-list">
              {cachedTracks.map((t) => (
                <div key={t.videoId} className="cache-track-item">
                  <span className="cache-track-id">{t.videoId}</span>
                  <span className="cache-track-size">{formatSize(t.size)}</span>
                  <button
                    className="cache-delete-btn"
                    onClick={() => handleDelete(t.videoId)}
                    aria-label="Remove from cache"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            {!confirmClear ? (
              <button className="btn-secondary cache-clear-btn" onClick={() => setConfirmClear(true)}>
                Clear all cache
              </button>
            ) : (
              <div className="cache-confirm-row">
                <span className="settings-desc">Are you sure?</span>
                <button className="btn-primary cache-confirm-yes" onClick={handleClearAll}>
                  Yes, clear all
                </button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <div className="settings-section">
        <h3>About</h3>
        <p className="settings-desc">
          YouTube Music Tesla — a web-based music player that uses YouTube as its source.
        </p>
        <p className="settings-desc">
          Search is powered by a public Invidious API instance. Playlist import uses YouTube RSS feeds.
          Ad skipping uses the SponsorBlock API.
        </p>
        <p className="settings-desc">
          No API key or account required.
        </p>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePlayerStore } from '../store/playerStore'
import PlaylistGrid from '../components/Playlist/PlaylistGrid'
import {
  importPlaylist, parsePlaylistId, resolveChannel, fetchChannelPlaylists,
} from '../services/youtube'

function message(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export default function Library() {
  const playlists = usePlayerStore((s) => s.playlists)
  const hydrated = usePlayerStore((s) => s.hydrated)
  const addPlaylist = usePlayerStore((s) => s.addPlaylist)
  const removePlaylist = usePlayerStore((s) => s.removePlaylist)

  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')

  const [channelInput, setChannelInput] = useState('')
  const [channelLoading, setChannelLoading] = useState(false)
  const [channelError, setChannelError] = useState('')
  const [channelSuccess, setChannelSuccess] = useState('')
  const [channelProgress, setChannelProgress] = useState<{ done: number; total: number } | null>(null)

  const [editing, setEditing] = useState(false)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const repairedRef = useRef(false)

  const refreshPlaylist = useCallback(async (id: string) => {
    setRefreshingId(id)
    try {
      const { playlist } = await importPlaylist(id)
      addPlaylist(playlist)
    } catch (err) {
      setError(message(err, 'Actualisation impossible.'))
    } finally {
      setRefreshingId(null)
    }
  }, [addPlaylist])

  /**
   * Complète les playlists persistées sans piste — typiquement celles dont
   * l'import initial a échoué lors d'un import de chaîne. L'ancienne version
   * sortait dès que la bibliothèque était non vide et ne les réparait jamais.
   */
  useEffect(() => {
    if (!hydrated || repairedRef.current) return
    const broken = playlists.filter((p) => p.tracks.length === 0)
    if (broken.length === 0) return

    repairedRef.current = true
    void (async () => {
      for (const p of broken) {
        try {
          const { playlist } = await importPlaylist(p.id)
          if (playlist.tracks.length > 0) addPlaylist(playlist)
        } catch {
          // La carte garde son badge « À actualiser ».
        }
      }
    })()
  }, [hydrated, playlists, addPlaylist])

  const handleImport = async () => {
    setError('')
    setWarning('')
    const id = parsePlaylistId(url)
    if (!id) {
      setError('Lien ou identifiant de playlist YouTube non reconnu.')
      return
    }
    setLoading(true)
    try {
      const { playlist, warning: importWarning } = await importPlaylist(id)
      addPlaylist(playlist)
      if (importWarning) setWarning(importWarning)
      setUrl('')
    } catch (err) {
      // La cause réelle est remontée telle quelle : « playlist privée »,
      // « aucune instance disponible »… au lieu d'un message générique.
      setError(message(err, "L'import a échoué."))
    } finally {
      setLoading(false)
    }
  }

  const handleChannelImport = async () => {
    setChannelError('')
    setChannelSuccess('')
    if (!channelInput.trim()) return

    setChannelLoading(true)
    setChannelProgress(null)
    try {
      const channel = await resolveChannel(channelInput.trim())
      if (!channel) {
        setChannelError('Aucune chaîne YouTube ne correspond à cette saisie.')
        return
      }

      const channelPlaylists = await fetchChannelPlaylists(channel.channelId, (done, total) =>
        setChannelProgress({ done, total }),
      )
      if (channelPlaylists.length === 0) {
        setChannelError('Cette chaîne ne publie aucune playlist publique.')
        return
      }

      const existingIds = new Set(playlists.map((p) => p.id))
      let added = 0
      for (const pl of channelPlaylists) {
        if (!existingIds.has(pl.id)) added++
        addPlaylist(pl)
      }

      const already = channelPlaylists.length - added
      setChannelSuccess(
        `${added} playlist${added > 1 ? 's' : ''} importée${added > 1 ? 's' : ''} depuis ${channel.name}` +
        (already > 0 ? ` (${already} déjà présente${already > 1 ? 's' : ''}, mise${already > 1 ? 's' : ''} à jour)` : ''),
      )
      setChannelInput('')
    } catch (err) {
      setChannelError(message(err, 'Impossible de récupérer cette chaîne. Réessayez plus tard.'))
    } finally {
      setChannelLoading(false)
      setChannelProgress(null)
    }
  }

  return (
    <div className="page library-page">
      <div className="page-header-row">
        <h1 className="page-title">Ma bibliothèque</h1>
        {playlists.length > 0 && (
          <button className="btn-secondary" onClick={() => setEditing((v) => !v)}>
            {editing ? 'Terminé' : 'Modifier'}
          </button>
        )}
      </div>

      <div className="import-block">
        <div className="import-label">Importer une playlist</div>
        <div className="import-row">
          <input
            type="text"
            placeholder="Lien ou identifiant de playlist YouTube…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="search-input"
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
          />
          <button className="btn-primary" onClick={handleImport} disabled={loading || !url.trim()}>
            {loading ? 'Import…' : 'Importer'}
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
        {warning && <p className="warning-text">{warning}</p>}
      </div>

      <hr className="library-divider" />

      <div className="import-block">
        <div className="import-label">Importer toutes les playlists d'une chaîne</div>
        <div className="import-row">
          <input
            type="text"
            placeholder="Nom, identifiant ou lien de chaîne YouTube…"
            value={channelInput}
            onChange={(e) => setChannelInput(e.target.value)}
            className="search-input"
            onKeyDown={(e) => e.key === 'Enter' && handleChannelImport()}
          />
          <button
            className="btn-primary"
            onClick={handleChannelImport}
            disabled={channelLoading || !channelInput.trim()}
          >
            {channelLoading ? 'Import…' : 'Importer la chaîne'}
          </button>
        </div>

        {channelProgress && (
          <div className="import-progress">
            <span>{channelProgress.done} / {channelProgress.total} playlists</span>
            <div className="import-progress-track">
              <div
                className="import-progress-fill"
                style={{ width: `${channelProgress.total ? (channelProgress.done / channelProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}
        {channelError && <p className="error-text">{channelError}</p>}
        {channelSuccess && <p className="success-text">{channelSuccess}</p>}
      </div>

      {!hydrated ? (
        <div className="search-status">
          <span className="spinner" />
          <span>Chargement de la bibliothèque…</span>
        </div>
      ) : playlists.length === 0 ? (
        <div className="empty-state">
          <p>Votre bibliothèque est vide.</p>
          <p>Collez le lien d'une playlist YouTube ci-dessus pour commencer.</p>
        </div>
      ) : (
        <PlaylistGrid
          playlists={playlists}
          editing={editing}
          onDelete={removePlaylist}
          onRefresh={refreshPlaylist}
          refreshingId={refreshingId}
        />
      )}
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { getCacheInfo, getAllCachedTracks, deleteAudio, clearCache } from '../services/audioCache'
import {
  getInstances, checkInstances, addUserInstance, removeUserInstance, prioritizeInstance,
} from '../services/instances'
import type { Instance, InstanceKind } from '../services/instances'
import { getThemePreference, setThemePreference, resolveTheme, watchSystemTheme } from '../services/theme'
import type { ThemePreference } from '../services/theme'
import { TrashIcon, ArrowUpIcon, RefreshIcon } from '../components/common/Icons'

const THEME_OPTIONS: { value: ThemePreference; label: string; hint: string }[] = [
  { value: 'auto', label: 'Automatique', hint: 'Suit le réglage du navigateur' },
  { value: 'light', label: 'Clair', hint: 'Toujours clair' },
  { value: 'dark', label: 'Sombre', hint: 'Toujours sombre' },
]

interface CachedEntry {
  videoId: string
  size: number
  cachedAt: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`
}

export default function SettingsPage() {
  const [cacheInfo, setCacheInfo] = useState({ count: 0, totalSize: 0 })
  const [cachedTracks, setCachedTracks] = useState<CachedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  const [theme, setTheme] = useState<ThemePreference>(getThemePreference)
  const [resolved, setResolved] = useState(() => resolveTheme(getThemePreference()))

  const [instances, setInstances] = useState<Instance[]>([])
  const [checking, setChecking] = useState(false)
  const [newOrigin, setNewOrigin] = useState('')
  const [newKind, setNewKind] = useState<InstanceKind>('invidious')
  const [instanceError, setInstanceError] = useState('')

  const refreshCache = useCallback(async () => {
    setLoading(true)
    const [info, tracks] = await Promise.all([getCacheInfo(), getAllCachedTracks()])
    setCacheInfo(info)
    setCachedTracks(
      tracks
        .map((t) => ({ videoId: t.videoId, size: t.size, cachedAt: t.cachedAt }))
        .sort((a, b) => b.cachedAt - a.cachedAt),
    )
    setLoading(false)
  }, [])

  const refreshInstances = useCallback(() => setInstances(getInstances()), [])

  useEffect(() => { refreshCache() }, [refreshCache])

  // En mode automatique, le libellé doit refléter le basculement jour/nuit du
  // navigateur sans attendre un rechargement.
  useEffect(() => watchSystemTheme(setResolved), [])

  const handleTheme = (value: ThemePreference) => {
    setTheme(value)
    setResolved(setThemePreference(value))
  }

  // L'annuaire est récupéré de façon asynchrone : afficher `getInstances()` au
  // montage montrerait la liste d'amorçage, pas celle réellement utilisée.
  useEffect(() => {
    let active = true
    refreshInstances()
    checkInstances().finally(() => { if (active) refreshInstances() })
    return () => { active = false }
  }, [refreshInstances])

  const handleCheckInstances = async () => {
    setChecking(true)
    await checkInstances(true)
    refreshInstances()
    setChecking(false)
  }

  const handleAddInstance = () => {
    setInstanceError('')
    if (!addUserInstance(newKind, newOrigin)) {
      setInstanceError('Adresse invalide. Format attendu : https://exemple.tld')
      return
    }
    setNewOrigin('')
    refreshInstances()
  }

  const handleDeleteCached = async (videoId: string) => {
    await deleteAudio(videoId)
    refreshCache()
  }

  const handleClearAll = async () => {
    await clearCache()
    setConfirmClear(false)
    refreshCache()
  }

  return (
    <div className="page settings-page">
      <h1 className="page-title">Réglages</h1>

      <section className="settings-section">
        <h2>Apparence</h2>
        <p className="settings-desc">
          En mode automatique, l'application suit le thème du navigateur — donc le passage
          jour/nuit de la voiture lorsque celle-ci le transmet.
        </p>

        <div className="theme-options" role="radiogroup" aria-label="Thème">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={`theme-option ${theme === option.value ? 'selected' : ''}`}
              onClick={() => handleTheme(option.value)}
              role="radio"
              aria-checked={theme === option.value}
            >
              <span className="theme-option-label">{option.label}</span>
              <span className="theme-option-hint">
                {option.value === 'auto' ? `${option.hint} — actuellement ${resolved === 'dark' ? 'sombre' : 'clair'}` : option.hint}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <h2>Sources</h2>
        <p className="settings-desc">
          La recherche, l'import et la lecture passent par des instances publiques Invidious et
          Piped. Ces instances sont régulièrement bloquées par YouTube : si plus rien ne
          fonctionne, relancez la vérification, puis remontez ou ajoutez une instance connue.
        </p>
        <p className="settings-desc">
          La liste Invidious est récupérée automatiquement depuis{' '}
          <a href="https://api.invidious.io/instances.json" target="_blank" rel="noreferrer" className="settings-link">
            l'annuaire officiel
          </a>{' '}
          (instances HTTPS avec API et CORS), et rafraîchie toutes les 30 minutes. En cas
          d'erreur sur une instance, l'appel repart automatiquement sur la suivante.
        </p>

        <div className="settings-row" style={{ marginBottom: 16 }}>
          <button className="btn-secondary" onClick={handleCheckInstances} disabled={checking}>
            {checking ? 'Actualisation…' : 'Actualiser la liste'}
          </button>
          <span className="settings-desc" style={{ margin: 0 }}>
            {instances.filter((i) => i.kind === 'invidious').length} Invidious ·{' '}
            {instances.filter((i) => i.kind === 'piped').length} Piped
          </span>
        </div>

        <div className="instance-list">
          {instances.map((inst) => (
            <div key={inst.origin} className="instance-item">
              <span className="instance-kind">{inst.kind}</span>
              <span className="instance-origin">{inst.origin}</span>
              <span
                className={`instance-state ${
                  inst.unverified ? '' : inst.penalizedUntil > Date.now() ? 'down' : 'up'
                }`}
              >
                {inst.unverified
                  ? 'non vérifiée'
                  : inst.penalizedUntil > Date.now()
                    ? 'hors service'
                    : `score ${Math.round(inst.score)}`}
              </span>
              <button
                className="icon-btn"
                onClick={() => { prioritizeInstance(inst.origin); refreshInstances() }}
                aria-label={`Prioriser ${inst.origin}`}
                title="Prioriser cette instance"
              >
                <ArrowUpIcon size={22} />
              </button>
              {inst.userAdded && (
                <button
                  className="icon-btn danger"
                  onClick={() => { removeUserInstance(inst.origin); refreshInstances() }}
                  aria-label={`Retirer ${inst.origin}`}
                >
                  <TrashIcon size={22} />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="settings-row">
          <select
            className="settings-select"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as InstanceKind)}
            aria-label="Type d'instance"
          >
            <option value="invidious">Invidious</option>
            <option value="piped">Piped (API)</option>
          </select>
          <input
            type="url"
            className="search-input"
            placeholder="https://exemple.tld"
            value={newOrigin}
            onChange={(e) => setNewOrigin(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddInstance()}
          />
          <button className="btn-primary" onClick={handleAddInstance} disabled={!newOrigin.trim()}>
            Ajouter
          </button>
        </div>
        {instanceError && <p className="error-text">{instanceError}</p>}
      </section>

      <section className="settings-section">
        <h2>Écoute hors ligne</h2>
        <p className="settings-desc">
          Les titres ne sont plus mis en cache automatiquement : utilisez le bouton de
          téléchargement sur une piste pour la conserver hors ligne.
        </p>

        {loading ? (
          <div className="search-status"><span className="spinner" /><span>Lecture du cache…</span></div>
        ) : cacheInfo.count === 0 ? (
          <p className="settings-desc">Aucun titre téléchargé pour l'instant.</p>
        ) : (
          <>
            <p className="settings-desc">
              <strong>{cacheInfo.count}</strong> titre{cacheInfo.count > 1 ? 's' : ''} —
              <strong> {formatSize(cacheInfo.totalSize)}</strong>
            </p>
            <div className="cache-track-list">
              {cachedTracks.map((t) => (
                <div key={t.videoId} className="cache-track-item">
                  <span className="cache-track-id">{t.videoId}</span>
                  <span className="cache-track-size">{formatSize(t.size)}</span>
                  <button
                    className="icon-btn danger"
                    onClick={() => handleDeleteCached(t.videoId)}
                    aria-label="Retirer du hors ligne"
                  >
                    <TrashIcon size={22} />
                  </button>
                </div>
              ))}
            </div>
            {!confirmClear ? (
              <button className="btn-secondary" onClick={() => setConfirmClear(true)}>
                Tout supprimer
              </button>
            ) : (
              <div className="confirm-row">
                <span className="settings-desc" style={{ margin: 0 }}>Confirmer la suppression ?</span>
                <button className="btn-primary" onClick={handleClearAll}>Oui, tout supprimer</button>
                <button className="btn-secondary" onClick={() => setConfirmClear(false)}>Annuler</button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>À propos</h2>
        <p className="settings-desc">
          YouTube Music Tesla — lecteur audio web utilisant YouTube comme source, pensé pour
          l'écran tactile de la voiture.
        </p>
        <p className="settings-desc">
          Recherche et lecture via les API publiques Invidious et Piped. Import de playlist par
          l'API des instances, avec repli sur les flux RSS YouTube. Passage des segments
          sponsorisés via SponsorBlock. Aucune clé d'API ni compte requis.
        </p>
      </section>

      <p className="settings-desc" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <RefreshIcon size={18} />
        L'annuaire et les scores sont réévalués automatiquement toutes les 30 minutes.
      </p>
    </div>
  )
}

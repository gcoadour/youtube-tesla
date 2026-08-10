import { useState, useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import NavRail from './NavRail'
import NowPlayingBar from './NowPlayingBar'
import NowPlayingView from '../Player/NowPlayingView'
import PlaybackError from '../Player/PlaybackError'
import { useAudioPlayer } from '../../hooks/useAudioPlayer'
import { usePlayerStore } from '../../store/playerStore'
import { applyTheme, getThemePreference, watchSystemTheme } from '../../services/theme'
import { MenuIcon } from '../common/Icons'

export default function Layout() {
  useAudioPlayer()

  const [railOpen, setRailOpen] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const hydrate = usePlayerStore((s) => s.hydrate)

  // La bibliothèque vit dans IndexedDB : elle se charge après le premier rendu.
  useEffect(() => { hydrate() }, [hydrate])

  // Le thème est déjà posé par le script d'index.html ; on le réapplique pour
  // rester cohérent si le script a échoué, puis on suit le navigateur tant que
  // la préférence est « auto ».
  useEffect(() => {
    applyTheme(getThemePreference())
    return watchSystemTheme(() => {})
  }, [])

  return (
    <div className={`layout ${railOpen ? 'rail-open' : ''}`}>
      <button className="rail-toggle" onClick={() => setRailOpen(true)} aria-label="Ouvrir le menu">
        <MenuIcon size={26} />
      </button>
      <div className="rail-backdrop" onClick={() => setRailOpen(false)} />
      <NavRail onNavigate={() => setRailOpen(false)} />
      <main className="main-content scroll-y">
        <Outlet />
      </main>
      <PlaybackError />
      <NowPlayingBar onExpand={() => setFullScreen(true)} />
      {fullScreen && <NowPlayingView onClose={() => setFullScreen(false)} />}
    </div>
  )
}

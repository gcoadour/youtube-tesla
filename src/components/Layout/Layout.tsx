import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer'
import { MenuIcon } from '../common/Icons'

export default function Layout() {
  useYouTubePlayer()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Menu">
        <MenuIcon size={24} />
      </button>
      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      <Sidebar onClose={() => setSidebarOpen(false)} />
      <main className="main-content" onClick={() => setSidebarOpen(false)}>
        <Outlet />
      </main>
      <div id="youtube-player" style={{ display: 'none' }} />
      <NowPlayingBar />
    </div>
  )
}

import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import NowPlayingBar from './NowPlayingBar'
import { useYouTubePlayer } from '../../hooks/useYouTubePlayer'

export default function Layout() {
  useYouTubePlayer()

  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">
        <Outlet />
      </main>
      <div id="youtube-player" style={{ display: 'none' }} />
      <NowPlayingBar />
    </div>
  )
}

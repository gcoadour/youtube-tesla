import { NavLink } from 'react-router-dom'
import { usePlayerStore } from '../../store/playerStore'
import { HomeIcon, SearchIcon, LibraryIcon, SettingsIcon, CloseIcon } from '../common/Icons'

interface Props {
  onClose?: () => void
}

export default function Sidebar({ onClose }: Props) {
  const playlists = usePlayerStore((s) => s.playlists)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">YouTube Music Tesla</div>
        <button className="sidebar-close" onClick={onClose} aria-label="Close menu">
          <CloseIcon size={24} />
        </button>
      </div>
      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <HomeIcon size={22} />
          <span>Home</span>
        </NavLink>
        <NavLink to="/search" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <SearchIcon size={22} />
          <span>Search</span>
        </NavLink>
        <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LibraryIcon size={22} />
          <span>Your Library</span>
        </NavLink>
      </nav>
      <div className="sidebar-divider" />
      <div className="sidebar-playlists">
        <div className="sidebar-section-title">Playlists</div>
        {playlists.map((p) => (
          <NavLink
            key={p.id}
            to={`/playlist/${p.id}`}
            className={({ isActive }) => `playlist-link ${isActive ? 'active' : ''}`}
          >
            {p.title}
          </NavLink>
        ))}
      </div>
      <div className="sidebar-footer">
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <SettingsIcon size={22} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  )
}

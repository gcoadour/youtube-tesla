import { NavLink } from 'react-router-dom'
import { usePlayerStore } from '../../store/playerStore'
import { HomeIcon, SearchIcon, LibraryIcon, SettingsIcon, CloseIcon } from '../common/Icons'

interface Props {
  onNavigate?: () => void
}

const NAV_ITEMS = [
  { to: '/', label: 'Accueil', Icon: HomeIcon, end: true },
  { to: '/search', label: 'Rechercher', Icon: SearchIcon, end: false },
  { to: '/library', label: 'Ma bibliothèque', Icon: LibraryIcon, end: false },
]

export default function NavRail({ onNavigate }: Props) {
  const playlists = usePlayerStore((s) => s.playlists)

  return (
    <aside className="rail">
      <div className="rail-header">
        <div className="rail-logo">YouTube Music</div>
        <button className="rail-close" onClick={onNavigate} aria-label="Fermer le menu">
          <CloseIcon size={26} />
        </button>
      </div>

      <nav className="rail-nav">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            title={label}
          >
            <Icon size={26} />
            <span className="nav-item-label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="rail-divider" />

      <div className="rail-playlists">
        <div className="rail-section-title">Playlists</div>
        {playlists.map((p) => (
          <NavLink
            key={p.id}
            to={`/playlist/${p.id}`}
            onClick={onNavigate}
            className={({ isActive }) => `playlist-link ${isActive ? 'active' : ''}`}
          >
            {p.title}
          </NavLink>
        ))}
      </div>

      <div className="rail-footer">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          title="Réglages"
        >
          <SettingsIcon size={26} />
          <span className="nav-item-label">Réglages</span>
        </NavLink>
      </div>
    </aside>
  )
}

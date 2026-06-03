import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout/Layout'
import Home from './pages/Home'
import SearchPage from './pages/SearchPage'
import PlaylistPage from './pages/PlaylistPage'
import Library from './pages/Library'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="playlist/:id" element={<PlaylistPage />} />
        <Route path="library" element={<Library />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}

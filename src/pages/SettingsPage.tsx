export default function SettingsPage() {
  return (
    <div className="page settings-page">
      <h1 className="page-title">Settings</h1>

      <div className="settings-section">
        <h3>About</h3>
        <p className="settings-desc">
          Spotify Tesla Clone — a web-based music player that uses YouTube as its source.
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

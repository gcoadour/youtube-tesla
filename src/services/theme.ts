/**
 * Thème clair / sombre.
 *
 * Trois préférences : « auto » suit le navigateur (donc, dans la voiture, le
 * réglage jour/nuit du véhicule quand il est relayé), « clair » et « sombre »
 * forcent le rendu.
 *
 * L'application effective se résume à poser `data-theme` sur <html> : la
 * feuille de styles fait le reste. Le même calcul est dupliqué dans un petit
 * script en tête d'index.html, exécuté avant le premier rendu, pour éviter un
 * flash de thème au chargement.
 */

export type ThemePreference = 'auto' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'yt-theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Couleur de la barre d'adresse, alignée sur --bg-base de chaque palette. */
const THEME_COLOR: Record<ResolvedTheme, string> = {
  dark: '#121212',
  light: '#ffffff',
}

export function getThemePreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored
  } catch {
    // Stockage indisponible : on retombe sur la détection automatique.
  }
  return 'auto'
}

function prefersDark(): boolean {
  // matchMedia manque sur les navigateurs embarqués les plus anciens : sans lui
  // on garde le sombre, plus sûr de nuit qu'un écran blanc en pleine face.
  if (typeof window.matchMedia !== 'function') return true
  return window.matchMedia(DARK_QUERY).matches
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'light' || preference === 'dark') return preference
  return prefersDark() ? 'dark' : 'light'
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference)
  document.documentElement.dataset.theme = resolved

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[resolved])

  return resolved
}

export function setThemePreference(preference: ThemePreference): ResolvedTheme {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // Le choix ne survivra pas au rechargement, mais s'applique tout de suite.
  }
  return applyTheme(preference)
}

/**
 * Suit les changements de thème du navigateur.
 * Le callback n'est invoqué que si la préférence est restée sur « auto » :
 * un thème forcé ne doit pas bouger sous les pieds de l'utilisateur.
 */
export function watchSystemTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {}

  const query = window.matchMedia(DARK_QUERY)
  const handler = () => {
    if (getThemePreference() !== 'auto') return
    onChange(applyTheme('auto'))
  }

  // addEventListener n'existe pas sur MediaQueryList avant Safari 14 /
  // Chrome 39 ; addListener reste le repli.
  if (typeof query.addEventListener === 'function') {
    query.addEventListener('change', handler)
    return () => query.removeEventListener('change', handler)
  }
  query.addListener(handler)
  return () => query.removeListener(handler)
}

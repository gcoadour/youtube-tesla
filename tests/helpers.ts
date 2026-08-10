import type { Page } from '@playwright/test'

/** Résolution paysage représentative de l'écran central Model 3 / Model Y. */
export const TESLA_VIEWPORT = { width: 1200, height: 720 }

export const BASE = '/youtube-tesla/#'

/**
 * Neutralise le réseau et sert des réponses d'instances déterministes.
 *
 * Les tests ne doivent pas dépendre de la santé d'une instance Invidious
 * publique : ce sont justement ces instances qui tombent en permanence, et un
 * test rouge pour cette raison n'apprend rien sur le code.
 */
export async function mockInstances(page: Page, options: {
  searchResults?: any[]
  playlist?: any
  failInvidious?: boolean
} = {}) {
  const {
    searchResults = defaultSearchResults(),
    playlist = defaultPlaylist(),
    failInvidious = false,
  } = options

  // Annuaire officiel : source unique des instances Invidious.
  await page.route('**/api.invidious.io/instances.json', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(instancesDirectory()),
    }),
  )

  // Annuaire Piped : la documentation officielle demande de le parser
  // dynamiquement. Une entrée suffit à rendre le comportement déterministe.
  await page.route('**/piped-instances.kavin.rocks/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ name: 'Piped test', api_url: 'https://piped-dyn.test' }]),
    }),
  )

  // Health-check Piped.
  await page.route('**/healthcheck', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"ok"}' }),
  )

  // Recherche Invidious
  await page.route('**/api/v1/search**', (route) =>
    failInvidious
      ? route.fulfill({ status: 503, body: '' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(searchResults) }),
  )

  // Playlist Invidious
  await page.route('**/api/v1/playlists/**', (route) =>
    failInvidious
      ? route.fulfill({ status: 503, body: '' })
      : route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(playlist) }),
  )

  // Métadonnées vidéo (préalable à la résolution du flux)
  await page.route('**/api/v1/videos/**', (route) =>
    failInvidious
      ? route.fulfill({ status: 503, body: '' })
      : route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ videoId: 'dQw4w9WgXcQ', title: 'Test', adaptiveFormats: [] }),
        }),
  )

  // Repli Piped
  await page.route('**/search?q=**filter=music_songs**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: pipedItems() }),
    }),
  )
  await page.route('**/streams/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ audioStreams: [{ url: 'https://piped.test/audio.m4a', bitrate: 128000 }] }),
    }),
  )

  // Vignettes : évite d'attendre des requêtes réseau réelles.
  await page.route('**/i.ytimg.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/gif', body: Buffer.from('R0lGODlhAQABAAAAACw=', 'base64') }),
  )

  await page.route('**/sponsor.ajay.app/**', (route) =>
    route.fulfill({ status: 404, body: '' }),
  )
}

/**
 * Coupe transitions et animations.
 *
 * Indispensable avant toute lecture de `getComputedStyle` : au changement de
 * thème, les couleurs sont interpolées pendant 160 ms et une mesure prise
 * pendant ce laps de temps renvoie une teinte intermédiaire qui n'existe dans
 * aucune des deux palettes.
 */
export async function freezeMotion(page: Page) {
  await page.addStyleTag({
    content: '*, *::before, *::after { transition: none !important; animation: none !important; }',
  })
}

/** Sert un vrai flux audio jouable, sans dépendre de YouTube. */
export async function mockAudioStream(page: Page) {
  await page.route('**/latest_version**', (route) => route.fulfill(silentWav()))
  await page.route('https://piped.test/audio.m4a', (route) => route.fulfill(silentWav()))
  await page.route('**/api/yt-audio/**', (route) => route.fulfill(silentWav()))
}

/** WAV PCM d'une seconde, silencieux : suffisant pour readyState et play(). */
export function silentWav() {
  const sampleRate = 8000
  const samples = sampleRate
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  return {
    status: 200,
    headers: { 'content-type': 'audio/wav', 'accept-ranges': 'bytes' },
    body: buffer,
  }
}

/** Trois instances Invidious, au format renvoyé par api.invidious.io. */
export function instancesDirectory() {
  const entry = (host: string, uptime: number) => [
    host,
    {
      uri: `https://${host}`,
      type: 'https',
      api: true,
      cors: true,
      monitor: { uptime },
      stats: { playback: { ratio: 0.9 } },
    },
  ]
  return [
    entry('inv-a.test', 99),
    entry('inv-b.test', 98),
    // Capacité CORS inconnue : l'annuaire renvoie très souvent un champ nul.
    // Elle doit rester utilisable pour les appels d'API.
    ['inv-c.test', {
      uri: 'https://inv-c.test',
      type: 'https',
      api: true,
      cors: null,
      monitor: { uptime: 97 },
      stats: { playback: { ratio: 0.9 } },
    }],
    // Écartées à la lecture de l'annuaire : injoignables ou inutilisables
    // depuis un navigateur.
    ['onion.test', { uri: 'http://onion.test', type: 'onion', api: true, cors: true }],
    ['nocors.test', { uri: 'https://nocors.test', type: 'https', api: true, cors: false }],
  ]
}

function defaultSearchResults() {
  return [
    { videoId: 'dQw4w9WgXcQ', title: 'Never Gonna Give You Up (Official Video)', author: 'RickAstleyVEVO', lengthSeconds: 213 },
    { videoId: 'kJQP7kiw5Fk', title: 'Despacito (Official Video)', author: 'LuisFonsiVEVO', lengthSeconds: 282 },
  ]
}

function pipedItems() {
  return [
    { url: '/watch?v=dQw4w9WgXcQ', title: 'Never Gonna Give You Up', uploaderName: 'Rick Astley', duration: 213 },
  ]
}

/** 120 pistes : franchit la limite de pagination de 100 d'Invidious. */
export function defaultPlaylist(count = 120) {
  return {
    title: 'Playlist de test',
    description: 'Description de test',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    videos: Array.from({ length: count }, (_, i) => ({
      videoId: `vid${String(i).padStart(8, '0')}`,
      title: `Titre ${i + 1}`,
      author: 'Artiste de test',
      lengthSeconds: 180,
    })),
  }
}

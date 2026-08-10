import { test, expect } from '@playwright/test'
import { BASE, mockInstances, mockAudioStream, silentWav } from './helpers'

/**
 * Conformité au contrat officiel : TeamPiped/OpenAPI, swagger.yaml,
 * référencé par https://docs.piped.video/docs/api-documentation/
 */
test.describe('Contrat Piped', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
    // Invidious hors jeu : on force le chemin Piped.
    await page.route('**/api/v1/**', (route) => route.abort('failed'))
    for (const host of ['inv-a', 'inv-b', 'inv-c', 'nocors']) {
      await page.route(`**/${host}.test/latest_version**`, (route) =>
        route.fulfill({ status: 403, body: '' }),
      )
    }
  })

  test('une page de recherche mêlant types ne retient que les vidéos', async ({ page }) => {
    // SearchPage.items mêle StreamItem, ChannelItem et PlaylistItem, distingués
    // par `type` — la spec l'énonce explicitement.
    await page.route('**/search?q=**filter=music_songs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          corrected: false,
          items: [
            { type: 'channel', name: 'Une chaîne', url: '/channel/UCxxxx', subscribers: 1000 },
            { type: 'playlist', name: 'Une playlist', url: '/playlist?list=PLxxxx', videos: 12 },
            { type: 'stream', url: '/watch?v=dQw4w9WgXcQ', title: 'Une vraie piste', uploaderName: 'Artiste', duration: 210 },
          ],
        }),
      }),
    )

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')

    await expect(page.locator('.track-item')).toHaveCount(1, { timeout: 25_000 })
    await expect(page.locator('.col-title')).toContainText('Une vraie piste')
  })

  test('le flux audio retenu est celui que le navigateur sait décoder', async ({ page }) => {
    await page.route('**/search?q=**filter=music_songs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ type: 'stream', url: '/watch?v=dQw4w9WgXcQ', title: 'Piste', uploaderName: 'Artiste', duration: 210 }],
        }),
      }),
    )

    // Opus/WebM a le meilleur débit, mais Safari ne le décode pas : un tri par
    // seul débit choisissait systématiquement un flux injouable sur iPhone.
    await page.route('**/streams/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          audioStreams: [
            { url: 'https://piped.test/opus.webm', bitrate: 160000, format: 'WEBMA_OPUS', mimeType: 'audio/webm', codec: 'opus', videoOnly: false },
            { url: 'https://piped.test/aac.m4a', bitrate: 128000, format: 'M4A', mimeType: 'audio/mp4', codec: 'mp4a.40.2', videoOnly: false },
          ],
        }),
      }),
    )
    await page.route('https://piped.test/aac.m4a', (route) => route.fulfill(silentWav()))
    await page.route('https://piped.test/opus.webm', (route) => route.fulfill(silentWav()))

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 25_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('piped.test'),
      { timeout: 30_000 },
    )

    const src = await page.evaluate(() => document.querySelector('audio')?.src ?? '')
    const decodesWebm = await page.evaluate(
      () => !!document.createElement('audio').canPlayType('audio/webm; codecs="opus"'),
    )

    // Chromium décode l'Opus et prend donc le plus haut débit ; un moteur qui ne
    // le décode pas doit se rabattre sur l'AAC plutôt que d'échouer.
    expect(src).toContain(decodesWebm ? 'opus.webm' : 'aac.m4a')
  })

  test('un flux marqué videoOnly est écarté', async ({ page }) => {
    await page.route('**/search?q=**filter=music_songs**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ type: 'stream', url: '/watch?v=dQw4w9WgXcQ', title: 'Piste', uploaderName: 'Artiste', duration: 210 }],
        }),
      }),
    )
    await page.route('**/streams/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          audioStreams: [
            { url: 'https://piped.test/videoonly.m4a', bitrate: 320000, format: 'M4A', mimeType: 'audio/mp4', videoOnly: true },
            { url: 'https://piped.test/aac.m4a', bitrate: 128000, format: 'M4A', mimeType: 'audio/mp4', codec: 'mp4a.40.2', videoOnly: false },
          ],
        }),
      }),
    )
    await page.route('https://piped.test/aac.m4a', (route) => route.fulfill(silentWav()))

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 25_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('aac.m4a'),
      { timeout: 30_000 },
    )
  })
})

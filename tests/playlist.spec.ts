import { test, expect } from '@playwright/test'
import { BASE, mockInstances, defaultPlaylist } from './helpers'

const LIBRARY = `${BASE}/library`
const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLtest123456789'

test.describe('Import de playlist', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
  })

  test('importe une playlist depuis une URL', async ({ page }) => {
    await page.goto(LIBRARY)
    await page.locator('.import-block').first().locator('.search-input').fill(PLAYLIST_URL)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()

    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })
    await expect(page.locator('.playlist-card-title')).toHaveText('Playlist de test')
  })

  test('la playlist importée contient ses pistes', async ({ page }) => {
    await page.goto(LIBRARY)
    await page.locator('.import-block').first().locator('.search-input').fill(PLAYLIST_URL)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    await page.locator('.playlist-card').click()
    // Le filtre « contenu musical » ne doit plus s'appliquer aux playlists :
    // c'est lui qui les vidait quand la durée était inconnue.
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 10_000 })
    expect(await page.locator('.track-item').count()).toBeGreaterThan(0)
  })

  test('un double import ne crée pas de doublon', async ({ page }) => {
    await page.goto(LIBRARY)
    const input = page.locator('.import-block').first().locator('.search-input')
    const button = page.getByRole('button', { name: 'Importer', exact: true })

    await input.fill(PLAYLIST_URL)
    await button.click()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    await input.fill(PLAYLIST_URL)
    await button.click()
    await page.waitForTimeout(2000)

    // L'ancien addPlaylist ré-empilait la playlist quand elle était déjà importée.
    await expect(page.locator('.playlist-card')).toHaveCount(1)
  })

  test('la bibliothèque survit à un rechargement', async ({ page }) => {
    await page.goto(LIBRARY)
    await page.locator('.import-block').first().locator('.search-input').fill(PLAYLIST_URL)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    await page.reload()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })
  })

  test('une playlist nécessitant un compte donne une erreur explicite', async ({ page }) => {
    await page.goto(LIBRARY)
    await page.locator('.import-block').first().locator('.search-input').fill('https://www.youtube.com/playlist?list=WL')
    await page.getByRole('button', { name: 'Importer', exact: true }).click()

    // Message dédié, et non « l'import a échoué ».
    await expect(page.locator('.error-text')).toContainText(/compte YouTube|non reconnu/i, { timeout: 10_000 })
  })

  test('pagine au-delà des 100 premiers titres', async ({ page }) => {
    await mockInstances(page, { playlist: defaultPlaylist(100) })
    // Page 2 : 20 titres supplémentaires, puis fin.
    let pageTwoServed = false
    await page.route('**/api/v1/playlists/**page=2**', (route) => {
      pageTwoServed = true
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          videos: Array.from({ length: 20 }, (_, i) => ({
            videoId: `page2vid${i}`,
            title: `Page 2 titre ${i + 1}`,
            author: 'Artiste de test',
            lengthSeconds: 200,
          })),
        }),
      })
    })

    await page.goto(LIBRARY)
    await page.locator('.import-block').first().locator('.search-input').fill(PLAYLIST_URL)
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    expect(pageTwoServed).toBe(true)

    // 100 titres en page 1 + 20 en page 2 : sans pagination, l'import
    // s'arrêtait aux 100 premiers.
    await page.locator('.playlist-card').click()
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('.track-item')).toHaveCount(120, { timeout: 15_000 })
  })
})

import { test, expect } from '@playwright/test'
import { BASE, mockInstances, mockAudioStream, silentWav } from './helpers'

/**
 * Couvre les deux garanties du socle réseau :
 *  - les instances Invidious viennent de l'annuaire api.invidious.io ;
 *  - toute erreur sur une instance fait passer à la suivante, sans sauter
 *    directement à la famille d'API suivante.
 */
test.describe('Annuaire et rotation des instances', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test("la liste provient de l'annuaire, filtrée sur https + api + cors", async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await expect(page.locator('.instance-item').first()).toBeVisible({ timeout: 15_000 })

    const origins = await page.locator('.instance-origin').allTextContents()

    // Les trois entrées exploitables de l'annuaire simulé.
    expect(origins).toContain('https://inv-a.test')
    expect(origins).toContain('https://inv-b.test')
    expect(origins).toContain('https://inv-c.test')

    // Onion : injoignable depuis la voiture. Sans CORS : rejetée par le
    // navigateur à chaque requête. Ni l'une ni l'autre ne doit être retenue.
    expect(origins.join(' ')).not.toContain('onion.test')
    expect(origins.join(' ')).not.toContain('nocors.test')
  })

  test('une instance en erreur sur la recherche fait passer à la suivante', async ({ page }) => {
    const seen: string[] = []

    await page.route('**/inv-a.test/api/v1/search**', (route) => {
      seen.push('inv-a')
      route.fulfill({ status: 500, body: '' })
    })
    await page.route('**/inv-b.test/api/v1/search**', (route) => {
      seen.push('inv-b')
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { videoId: 'dQw4w9WgXcQ', title: 'Reprise sur inv-b', author: 'Artiste', lengthSeconds: 200 },
        ]),
      })
    })

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')

    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.col-title')).toContainText('Reprise sur inv-b')
    expect(seen).toEqual(['inv-a', 'inv-b'])
  })

  test("un flux audio en échec repart sur l'instance suivante, pas sur Piped", async ({ page }) => {
    // inv-a sert les métadonnées mais son flux échoue : c'est le cas typique
    // d'une instance vivante dont le relais est bloqué par YouTube.
    await page.route('**/inv-a.test/latest_version**', (route) =>
      route.fulfill({ status: 403, body: '' }),
    )

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    const src = await page.evaluate(() => document.querySelector('audio')?.src ?? '')
    expect(src).toContain('inv-b.test')
    // Piped ne doit être atteint qu'une fois toutes les instances épuisées.
    expect(src).not.toContain('piped')
  })

  test('Piped ne prend le relais qu\'après épuisement des instances Invidious', async ({ page }) => {
    for (const host of ['inv-a', 'inv-b', 'inv-c']) {
      await page.route(`**/${host}.test/latest_version**`, (route) =>
        route.fulfill({ status: 403, body: '' }),
      )
    }

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('piped.test'),
      { timeout: 40_000 },
    )
  })

  test("l'annuaire indisponible n'efface pas les instances connues", async ({ page }) => {
    // Premier passage : l'annuaire répond, la liste est mise en cache.
    await page.goto(`${BASE}/settings`)
    await expect(page.locator('.instance-item').first()).toBeVisible({ timeout: 15_000 })
    const before = await page.locator('.instance-origin').count()

    await page.route('**/api.invidious.io/instances.json', (route) =>
      route.fulfill({ status: 503, body: '' }),
    )
    await page.reload()

    await expect(page.locator('.instance-item').first()).toBeVisible({ timeout: 15_000 })
    expect(await page.locator('.instance-origin').count()).toBe(before)
  })
})

test.describe('Diagnostic des instances', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
  })

  test("distingue une API bloquée d'un flux injouable", async ({ page }) => {
    // inv-a : API refusée (CORS) mais flux parfaitement lisible — c'est le cas
    // qui doit rester exploitable, et que l'ancienne résolution condamnait.
    await page.route('**/inv-a.test/api/v1/videos/**', (route) => route.abort('failed'))
    await page.route('**/inv-a.test/latest_version**', (route) => route.fulfill(silentWav()))

    // inv-b : API disponible mais flux mort.
    await page.route('**/inv-b.test/latest_version**', (route) => route.fulfill({ status: 403, body: '' }))

    await page.goto(`${BASE}/settings`)
    await page.getByRole('button', { name: 'Tester les instances' }).click()

    const rowA = page.locator('.instance-item', { hasText: 'inv-a.test' })
    await expect(rowA.locator('.probe.down')).toContainText('API', { timeout: 30_000 })
    await expect(rowA.locator('.probe.up')).toContainText('Flux')

    const rowB = page.locator('.instance-item', { hasText: 'inv-b.test' })
    await expect(rowB.locator('.probe.up')).toContainText('API', { timeout: 30_000 })
    await expect(rowB.locator('.probe.down')).toContainText('Flux')
  })
})

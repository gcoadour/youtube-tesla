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

  test("la liste provient de l'annuaire, sans les protocoles injoignables", async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await expect(page.locator('.instance-item').first()).toBeVisible({ timeout: 15_000 })

    const origins = await page.locator('.instance-origin').allTextContents()

    expect(origins).toContain('https://inv-a.test')
    expect(origins).toContain('https://inv-b.test')
    expect(origins).toContain('https://inv-c.test')

    // Onion : injoignable depuis un navigateur ordinaire, donc écartée.
    expect(origins.join(' ')).not.toContain('onion.test')

    // Sans CORS en revanche, l'instance est conservée : son API est inutilisable
    // mais son flux, lu par <audio>, ne dépend pas du CORS.
    expect(origins).toContain('https://nocors.test')
  })

  test("une instance sans CORS n'est jamais interrogée pour un appel d'API", async ({ page }) => {
    let nocorsQueried = false
    await page.route('**/nocors.test/**', (route) => {
      nocorsQueried = true
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
    })

    // Toutes les instances Invidious CORS échouent : la cascade doit épuiser ce
    // qu'elle s'autorise puis basculer sur Piped, sans jamais toucher
    // l'instance sans CORS — qui ne pourrait de toute façon pas répondre.
    for (const host of ['inv-a', 'inv-b', 'inv-c']) {
      await page.route(`**/${host}.test/api/v1/search**`, (route) =>
        route.fulfill({ status: 500, body: '' }),
      )
    }

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 25_000 })

    expect(nocorsQueried, "l'instance sans CORS a été interrogée pour rien").toBe(false)
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

  test('une capacité CORS inconnue reste utilisable pour les appels API', async ({ page }) => {
    let inv3Queried = false

    // inv-a et inv-b tombent : la cascade doit atteindre inv-c, dont l'annuaire
    // ne déclare pas la capacité CORS. La traiter comme un refus excluait toutes
    // les instances Invidious et ne laissait que Piped.
    for (const host of ['inv-a', 'inv-b']) {
      await page.route(`**/${host}.test/api/v1/search**`, (route) =>
        route.fulfill({ status: 500, body: '' }),
      )
    }
    await page.route('**/inv-c.test/api/v1/search**', (route) => {
      inv3Queried = true
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { videoId: 'dQw4w9WgXcQ', title: 'Servi par inv-c', author: 'Artiste', lengthSeconds: 200 },
        ]),
      })
    })

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')

    await expect(page.locator('.col-title')).toContainText('Servi par inv-c', { timeout: 25_000 })
    expect(inv3Queried).toBe(true)
  })

  test('une page de défi anti-bot fait passer à l\'instance suivante', async ({ page }) => {
    // Réponse 200 mais HTML : signature du dispositif anti-bot que la liste
    // officielle impose aux instances publiques. Ce n'est pas du JSON, donc pas
    // exploitable — et surtout, ce n'est pas une raison de clore la cascade.
    await page.route('**/inv-a.test/api/v1/search**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<html>Just a moment…</html>' }),
    )
    await page.route('**/inv-b.test/api/v1/search**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { videoId: 'dQw4w9WgXcQ', title: 'Reprise après défi', author: 'Artiste', lengthSeconds: 200 },
        ]),
      }),
    )

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.col-title')).toContainText('Reprise après défi', { timeout: 25_000 })
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
    // nocors.test comprise : sans CORS elle ne sert pas d'API, mais elle reste
    // une source de flux valable et serait retenue avant Piped.
    for (const host of ['inv-a', 'inv-b', 'inv-c', 'nocors']) {
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
    await expect(rowA.locator('.probe', { hasText: 'API' })).toHaveClass(/down/, { timeout: 30_000 })
    await expect(rowA.locator('.probe', { hasText: 'Flux' })).toHaveClass(/up/)

    const rowB = page.locator('.instance-item', { hasText: 'inv-b.test' })
    await expect(rowB.locator('.probe', { hasText: 'API' })).toHaveClass(/up/, { timeout: 30_000 })
    await expect(rowB.locator('.probe', { hasText: 'Flux' })).toHaveClass(/down/)

    // La recherche a son propre verdict : une API saine n'en dit rien.
    await expect(rowB.locator('.probe', { hasText: 'Recherche' })).toBeVisible()
  })

  test('une capacité obtenue via relais est signalée comme telle', async ({ page }) => {
    // Direct refusé partout, relais fonctionnel : le diagnostic doit annoncer
    // « ✓ relais » et non « ✗ ». Il suit ainsi le chemin réel de l'application.
    await page.route('**/inv-a.test/api/v1/**', (route) => route.abort('failed'))
    await page.route('**/api.allorigins.win/**', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ videoId: 'dQw4w9WgXcQ', title: 'x', author: 'y', lengthSeconds: 100 }]),
      }),
    )

    await page.goto(`${BASE}/settings`)
    await page.getByRole('button', { name: 'Tester les instances' }).click()

    const rowA = page.locator('.instance-item', { hasText: 'inv-a.test' })
    await expect(rowA.locator('.probe', { hasText: 'API' })).toHaveClass(/relay/, { timeout: 40_000 })
    await expect(rowA.locator('.probe', { hasText: 'API' })).toContainText('relais')
  })
})

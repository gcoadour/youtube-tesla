import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, mockInstances, mockAudioStream, silentWav } from './helpers'

const ALLORIGINS = '**/api.allorigins.win/**'
const SEARCH_PAYLOAD = [
  { videoId: 'dQw4w9WgXcQ', title: 'Servi par le relais', author: 'Artiste', lengthSeconds: 200 },
]

/**
 * Coupe tout accès direct aux API d'instances, sans toucher aux flux ni aux
 * relais. Exprimé par prédicat plutôt que par liste d'hôtes : les instances
 * Piped viennent d'un annuaire dynamique, les énumérer serait fragile.
 */
async function breakDirectApis(page: Page) {
  await page.route(
    (url) =>
      url.pathname.includes('/api/v1/') ||
      /^\/(search|streams)\b/.test(url.pathname),
    (route) => route.abort('failed'),
  )
}

test.describe('Relais CORS', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('le direct qui aboutit ne passe jamais par un relais', async ({ page }) => {
    let proxyUsed = false
    await page.route(ALLORIGINS, (route) => {
      proxyUsed = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_PAYLOAD) })
    })

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 20_000 })

    // Garantie de vie privée autant que de performance : rien ne doit transiter
    // par un tiers tant que la source directe répond.
    expect(proxyUsed, 'un relais a été sollicité alors que le direct répondait').toBe(false)
  })

  test('la recherche repasse par un relais quand tout le direct échoue', async ({ page }) => {
    await breakDirectApis(page)
    await page.route(ALLORIGINS, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_PAYLOAD) }),
    )

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')

    await expect(page.locator('.col-title')).toContainText('Servi par le relais', { timeout: 30_000 })
  })

  test('le relais désactivé laisse la recherche échouer franchement', async ({ page }) => {
    let proxyUsed = false
    await page.route(ALLORIGINS, (route) => {
      proxyUsed = true
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_PAYLOAD) })
    })

    await page.goto(`${BASE}/settings`)
    await page.getByRole('radio', { name: /Désactivé/ }).click()

    await breakDirectApis(page)
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')

    await expect(page.locator('.search-error')).toBeVisible({ timeout: 30_000 })
    expect(proxyUsed, 'un relais a été sollicité malgré la désactivation').toBe(false)
  })

  test('la lecture bascule sur un flux relayé en dernier recours', async ({ page }) => {
    // Tous les flux directs sont refusés, y compris ceux de Piped.
    for (const host of ['inv-a', 'inv-b', 'inv-c', 'nocors']) {
      await page.route(`**/${host}.test/latest_version**`, (route) => route.fulfill({ status: 403, body: '' }))
    }
    await page.route('https://piped.test/audio.m4a', (route) => route.fulfill({ status: 403, body: '' }))

    // Le relais, lui, sert le flux : il attaque l'instance depuis une autre IP
    // et sans en-tête Origin, ce qui contourne le dispositif anti-bot.
    await page.route(ALLORIGINS, (route) => route.fulfill(silentWav()))

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('allorigins'),
      { timeout: 40_000 },
    )
  })
})

test.describe('Instance Cobalt', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('une instance configurée devient la source prioritaire', async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await page.getByLabel("URL de l'instance Cobalt").fill('https://cobalt.test')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    // Contrat officiel : POST /, réponse { status: 'tunnel', url }.
    let method = ''
    let body: any = null
    await page.route('https://cobalt.test/', (route) => {
      method = route.request().method()
      body = route.request().postDataJSON()
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'tunnel', url: 'https://cobalt.test/tunnel/abc', filename: 'a.m4a' }),
      })
    })
    await page.route('https://cobalt.test/tunnel/**', (route) => route.fulfill(silentWav()))

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 20_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('cobalt.test/tunnel'),
      { timeout: 30_000 },
    )

    expect(method).toBe('POST')
    expect(body.downloadMode).toBe('audio')
    expect(body.url).toContain('dQw4w9WgXcQ')
  })

  test('une instance Cobalt en erreur laisse les autres sources prendre le relais', async ({ page }) => {
    await page.goto(`${BASE}/settings`)
    await page.getByLabel("URL de l'instance Cobalt").fill('https://cobalt.test')
    await page.getByRole('button', { name: 'Enregistrer' }).click()

    await page.route('https://cobalt.test/', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'error', error: { code: 'error.api.fetch.fail' } }),
      }),
    )

    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 20_000 })
    await page.locator('.track-item').first().click()

    // Repli sur Invidious : une instance Cobalt en panne ne doit rien bloquer.
    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('latest_version'),
      { timeout: 30_000 },
    )
  })
})

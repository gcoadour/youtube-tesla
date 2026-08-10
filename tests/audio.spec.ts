import { test, expect } from '@playwright/test'
import { BASE, mockInstances, mockAudioStream } from './helpers'

const SEARCH = `${BASE}/search`

test.describe('Lecture audio', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('la recherche renvoie des résultats', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    expect(await page.locator('.track-item').count()).toBeGreaterThan(0)
  })

  test('la durée réelle est affichée, pas 0:00', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    // 213 s => 3:33. L'ancienne version forçait duration: 0 sur les résultats.
    await expect(page.locator('.track-item').first().locator('.col-duration')).toHaveText('3:33')
  })

  test('un clic sur un résultat alimente la source audio', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => !!document.querySelector('audio')?.src, { timeout: 30_000 })
    const src = await page.evaluate(() => document.querySelector('audio')?.src ?? '')

    expect(src).toMatch(/^https?:\/\//)
    // La lecture streame désormais : plus de blob: construit après un
    // téléchargement intégral, qui était bloqué par CORS en production.
    expect(src.startsWith('blob:')).toBe(false)
  })

  test("l'élément audio passe en lecture", async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    expect(await page.evaluate(() => document.querySelector('audio')?.paused ?? true)).toBe(false)
  })

  test('le son est audible (volume > 0, non coupé)', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    const state = await page.evaluate(() => {
      const audio = document.querySelector('audio')!
      return { volume: audio.volume, muted: audio.muted }
    })
    expect(state.volume).toBeGreaterThan(0)
    expect(state.muted).toBe(false)
  })

  test('toucher une piste pendant la lecture ne met pas en pause', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused
    }, { timeout: 30_000 })

    // Deuxième piste : l'ancien code appelait togglePlay() et mettait en pause.
    await page.locator('.track-item').nth(1).click()
    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused
    }, { timeout: 30_000 })

    expect(await page.evaluate(() => document.querySelector('audio')?.paused ?? true)).toBe(false)
  })

  test('bascule sur Piped quand Invidious ne répond pas', async ({ page }) => {
    await mockInstances(page, { failInvidious: true })
    await mockAudioStream(page)

    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 20_000 })

    await page.locator('.track-item').first().click()
    await page.waitForFunction(
      () => (document.querySelector('audio')?.src ?? '').includes('piped.test'),
      { timeout: 30_000 },
    )
  })
})

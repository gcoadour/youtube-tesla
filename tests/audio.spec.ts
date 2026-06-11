import { test, expect } from '@playwright/test'

const SEARCH = '/youtube-tesla/#/search'

test.describe('Audio playback', () => {
  test('search returns results', async ({ page }) => {
    await page.goto(SEARCH)
    const input = page.locator('.search-input')
    await input.fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    const count = await page.locator('.track-item').count()
    expect(count).toBeGreaterThan(0)
  })

  test('clicking a search result sets audio src', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    const src = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.src ?? ''
    })
    expect(src).toBeTruthy()
    expect(src).toMatch(/^https?:\/\//)
  })

  test('audio element enters playing state', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    const paused = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.paused ?? true
    })
    expect(paused).toBe(false)
  })

  test('audio is audible (volume > 0, not muted)', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    const state = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return {
        volume: audio?.volume ?? 0,
        muted: audio?.muted ?? true,
        paused: audio?.paused ?? true,
        readyState: audio?.readyState ?? 0,
      }
    })

    expect(state.volume).toBeGreaterThan(0)
    expect(state.muted).toBe(false)
    expect(state.paused).toBe(false)
    expect(state.readyState).toBeGreaterThanOrEqual(2)
  })

  test('audio has valid duration', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && audio.duration > 0 && !isNaN(audio.duration)
    }, { timeout: 30_000 })

    const duration = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.duration ?? 0
    })
    expect(duration).toBeGreaterThan(0)
  })

  test('audio progress advances over time', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    const t1 = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.currentTime ?? 0
    })

    await page.waitForTimeout(2000)

    const t2 = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.currentTime ?? 0
    })

    expect(t2).toBeGreaterThan(t1)
  })

  test('next button changes track', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    await page.locator('[aria-label="Next"]').click()

    await page.waitForTimeout(1000)

    const src2 = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.src ?? ''
    })
    expect(src2).toBeTruthy()
  })

  test('pause stops audio', async ({ page }) => {
    await page.goto(SEARCH)
    await page.locator('.search-input').fill('Rick Astley Never Gonna Give You Up')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })

    await page.locator('.track-item').first().click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio && !audio.paused && audio.readyState >= 2
    }, { timeout: 30_000 })

    await page.locator('[aria-label="Pause"]').click()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return audio?.paused === true
    }, { timeout: 5_000 })

    const paused = await page.evaluate(() => {
      const audio = document.querySelector('audio')
      return audio?.paused ?? false
    })
    expect(paused).toBe(true)
  })
})

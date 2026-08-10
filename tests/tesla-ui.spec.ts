import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, TESLA_VIEWPORT, mockInstances, mockAudioStream } from './helpers'

/** Seuil retenu pour l'usage au doigt en conduite (jeton --touch-min). */
const MIN_TOUCH_SIZE = 56

/**
 * Vérifie que toutes les cibles interactives visibles sont assez grandes.
 * Renvoie la liste des fautives pour un message d'échec exploitable.
 */
async function undersizedTargets(page: Page, scope = 'body') {
  return page.evaluate(({ scope, min }) => {
    const selector = 'button, a[href], [role="button"], [role="slider"], input, select'
    const offenders: { tag: string; label: string; w: number; h: number }[] = []

    for (const el of Array.from(document.querySelectorAll(`${scope} ${selector}`))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue

      if (rect.width < min || rect.height < min) {
        offenders.push({
          tag: el.tagName.toLowerCase(),
          label: el.getAttribute('aria-label') || el.textContent?.trim().slice(0, 40) || '',
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        })
      }
    }
    return offenders
  }, { scope, min: MIN_TOUCH_SIZE })
}

test.use({ viewport: TESLA_VIEWPORT, hasTouch: true })

test.describe('Interface Tesla (paysage tactile)', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('aucun défilement horizontal sur les pages principales', async ({ page }) => {
    for (const route of ['/', '/search', '/library', '/settings']) {
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(300)
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow, `débordement horizontal sur ${route}`).toBeLessThanOrEqual(1)
    }
  })

  test('les cibles tactiles de la navigation respectent le minimum', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await page.waitForTimeout(300)
    expect(await undersizedTargets(page, '.rail')).toEqual([])
  })

  test('les contrôles du lecteur respectent le minimum', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().tap()
    await expect(page.locator('.now-playing-bar')).toBeVisible({ timeout: 20_000 })

    expect(await undersizedTargets(page, '.now-playing-bar')).toEqual([])
  })

  test('les actions de playlist sont atteignables sans survol', async ({ page }) => {
    await page.goto(`${BASE}/library`)
    await page.locator('.import-block').first().locator('.search-input').fill('PLtest123456789')
    await page.getByRole('button', { name: 'Importer', exact: true }).click()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    // Le mode « Modifier » remplace la révélation au survol, impossible au doigt.
    await page.getByRole('button', { name: 'Modifier' }).tap()
    const action = page.locator('.playlist-card-action').first()
    await expect(action).toBeVisible()

    // Visible signifie ici réellement opaque, pas masqué par opacity: 0.
    const opacity = await action.evaluate((el) => getComputedStyle(el).opacity)
    expect(Number(opacity)).toBeGreaterThan(0.9)
    expect(await undersizedTargets(page, '.playlist-card-actions')).toEqual([])
  })

  test('la vue plein écran s\'ouvre depuis la pochette et se referme', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().tap()
    await expect(page.locator('.now-playing-bar')).toBeVisible({ timeout: 20_000 })

    await page.locator('.npb-open').tap()
    await expect(page.locator('.now-playing-view')).toBeVisible()
    expect(await undersizedTargets(page, '.now-playing-view')).toEqual([])

    await page.getByRole('button', { name: 'Réduire le lecteur' }).tap()
    await expect(page.locator('.now-playing-view')).toBeHidden()
  })

  test('la barre de progression se déplace au glisser', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().tap()

    await page.waitForFunction(() => {
      const audio = document.querySelector('audio')
      return !!audio && audio.readyState >= 1 && audio.duration > 0
    }, { timeout: 30_000 })

    const bar = page.locator('.now-playing-bar .progress-bar')
    const box = (await bar.boundingBox())!

    // Glissement, et non simple clic : c'est ce que l'ancienne barre ne gérait pas.
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, { steps: 10 })
    await page.mouse.up()

    const currentTime = await page.evaluate(() => document.querySelector('audio')?.currentTime ?? 0)
    expect(currentTime).toBeGreaterThan(0)
  })

  test('le texte reste lisible : aucun corps de texte sous 14 px', async ({ page }) => {
    await page.goto(`${BASE}/library`)
    await page.waitForTimeout(300)

    const tooSmall = await page.evaluate(() => {
      const offenders: { text: string; size: string }[] = []
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const direct = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .filter(Boolean)
          .join(' ')
        if (!direct) continue
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size < 14) offenders.push({ text: direct.slice(0, 40), size: `${size}px` })
      }
      return offenders
    })

    expect(tooSmall).toEqual([])
  })
})

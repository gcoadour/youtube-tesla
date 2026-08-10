import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, TESLA_VIEWPORT, mockInstances, mockAudioStream, freezeMotion } from './helpers'

/** Luminance relative WCAG d'une couleur CSS `rgb(...)` / `rgba(...)`. */
function luminance(color: string): number {
  const [r, g, b] = color.match(/[\d.]+/g)!.slice(0, 3).map(Number)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** Couleur de fond effective : remonte les ancêtres jusqu'à une surface opaque. */
async function backgroundOf(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    let el: Element | null = document.querySelector(sel)
    while (el) {
      const bg = getComputedStyle(el).backgroundColor
      if (bg && !bg.includes('rgba(0, 0, 0, 0)') && bg !== 'transparent') return bg
      el = el.parentElement
    }
    return getComputedStyle(document.body).backgroundColor
  }, selector)
}

test.use({ viewport: TESLA_VIEWPORT })

test.describe('Thème', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('suit le navigateur en sombre', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${BASE}/`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('suit le navigateur en clair', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto(`${BASE}/`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('le choix manuel prime sur le navigateur et survit au rechargement', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${BASE}/settings`)

    await page.getByRole('radio', { name: /Clair/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // Le navigateur reste en sombre : le forçage doit tenir au rechargement.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('radio', { name: /Automatique/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('le retour en automatique suit un changement de thème navigateur', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${BASE}/`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.emulateMedia({ colorScheme: 'light' })
    // Sans rechargement : le suivi doit être actif à l'exécution.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('aucun flash de thème clair au chargement en mode sombre', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${BASE}/`, { waitUntil: 'commit' })
    // Le script d'index.html s'exécute avant le bundle : l'attribut est déjà
    // correct avant même que React ne soit monté.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`le texte reste contrasté en thème ${scheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`${BASE}/settings`)
      await expect(page.locator('.settings-section').first()).toBeVisible()
      await freezeMotion(page)

      // Échantillon des rôles de texte les plus exposés, dont ceux teintés en
      // accent — le vert Spotify est illisible sur fond blanc, d'où le jeton
      // --accent-text distinct de --accent.
      const targets = ['.page-title', '.settings-desc', '.theme-option-label', '.settings-link']

      for (const selector of targets) {
        if (await page.locator(selector).count() === 0) continue
        const color = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).color)
        const bg = await backgroundOf(page, selector)
        expect(contrast(color, bg), `${selector} en ${scheme} (${color} sur ${bg})`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  test('le bouton de lecture reste lisible dans les deux thèmes', async ({ page }) => {
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(`${BASE}/search`)
      await page.locator('.search-input').fill('Rick Astley')
      await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
      await page.locator('.track-item').first().click()
      await expect(page.locator('.play-btn')).toBeVisible({ timeout: 20_000 })
      await freezeMotion(page)

      // Le bouton peint une surface inversée : sans jeton d'avant-plan associé,
      // le thème clair donnerait une icône noire sur un fond noir.
      const { color, background } = await page.locator('.play-btn').evaluate((el) => {
        const s = getComputedStyle(el)
        return { color: s.color, background: s.backgroundColor }
      })
      expect(
        contrast(color, background),
        `bouton lecture en ${scheme} : ${color} sur ${background}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})

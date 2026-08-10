import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { BASE, mockInstances, mockAudioStream, freezeMotion } from './helpers'

/** iPhone 14 en portrait — le plus étroit des formats courants. */
const PHONE = { width: 390, height: 844 }

/** Cible tactile minimale au pouce ; le rail passe en tiroir sous ce format. */
const MIN_TOUCH_SIZE = 44

async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const de = document.documentElement
    return de.scrollWidth - de.clientWidth
  })
}

/**
 * Éléments visibles dépassant la largeur du viewport.
 *
 * Le rail est exclu quand le tiroir est fermé : il est alors volontairement
 * hors cadre (translateX(-100%)), ce qui est le comportement attendu et non un
 * défaut de mise en page.
 */
async function clippedElements(page: Page) {
  return page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const drawerClosed = !document.querySelector('.layout.rail-open')
    const rail = document.querySelector('.rail')
    const out: string[] = []

    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (drawerClosed && rail && (el === rail || rail.contains(el))) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > width + 1 || r.left < -1) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}`)
      }
    }
    return out
  })
}

test.use({ viewport: PHONE, hasTouch: true, isMobile: true })

test.describe('Format mobile', () => {
  test.beforeEach(async ({ page }) => {
    await mockInstances(page)
    await mockAudioStream(page)
  })

  test('aucune page ne déborde horizontalement', async ({ page }) => {
    for (const route of ['/', '/search', '/library', '/settings']) {
      await page.goto(`${BASE}${route}`)
      await page.waitForTimeout(300)
      expect(await horizontalOverflow(page), `débordement sur ${route}`).toBeLessThanOrEqual(1)
      expect(await clippedElements(page), `éléments hors cadre sur ${route}`).toEqual([])
    }
  })

  test('le rail est un tiroir : caché, ouvert au menu, refermé à la navigation', async ({ page }) => {
    await page.goto(`${BASE}/`)
    await freezeMotion(page)

    // Hors écran au repos : il ne doit pas manger la largeur utile.
    const railLeft = await page.locator('.rail').evaluate((el) => el.getBoundingClientRect().right)
    expect(railLeft).toBeLessThanOrEqual(0)

    await page.getByRole('button', { name: 'Ouvrir le menu' }).tap()
    await expect(page.locator('.rail')).toBeInViewport()

    await page.getByRole('link', { name: 'Rechercher' }).tap()
    await expect(page).toHaveURL(/#\/search$/)
    // Sans refermeture, le tiroir masquerait la page qu'on vient d'ouvrir.
    await expect(page.locator('.rail')).not.toBeInViewport()
  })

  test('la barre de lecture ne recouvre pas la liste des titres', async ({ page }) => {
    await page.goto(`${BASE}/library`)
    await page.locator('.import-block').first().locator('.search-input').fill('PLtest123456789')
    await page.getByRole('button', { name: 'Importer', exact: true }).tap()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    await page.locator('.playlist-card').tap()
    await page.locator('.track-item').first().tap()
    await expect(page.locator('.now-playing-bar')).toBeVisible({ timeout: 20_000 })
    await freezeMotion(page)

    // Le bouton de lecture débordait au-dessus de la barre et se superposait
    // aux dernières pistes.
    const bar = (await page.locator('.now-playing-bar').boundingBox())!
    const play = (await page.locator('.now-playing-bar .play-btn').boundingBox())!
    expect(play.y).toBeGreaterThanOrEqual(bar.y - 1)
    expect(play.y + play.height).toBeLessThanOrEqual(bar.y + bar.height + 1)

    // Et le contenu défilant doit pouvoir passer entièrement au-dessus.
    const padding = await page.locator('.main-content').evaluate(
      (el) => parseFloat(getComputedStyle(el).paddingBottom),
    )
    expect(padding).toBeGreaterThanOrEqual(bar.height)
  })

  test('les commandes de la barre restent assez grandes et ne se chevauchent pas', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().tap()
    await expect(page.locator('.now-playing-bar')).toBeVisible({ timeout: 20_000 })
    await freezeMotion(page)

    const boxes = await page.locator('.now-playing-bar button:visible').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { label: el.getAttribute('aria-label') || '', x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )

    expect(boxes.length).toBeGreaterThan(0)
    for (const b of boxes) {
      expect(Math.min(b.w, b.h), `cible « ${b.label} » trop petite`).toBeGreaterThanOrEqual(MIN_TOUCH_SIZE)
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]
        const c = boxes[j]
        const overlap = a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h
        expect(overlap, `« ${a.label} » chevauche « ${c.label} »`).toBe(false)
      }
    }
  })

  test('la vue plein écran donne accès à toutes les commandes', async ({ page }) => {
    await page.goto(`${BASE}/search`)
    await page.locator('.search-input').fill('Rick Astley')
    await expect(page.locator('.track-item').first()).toBeVisible({ timeout: 15_000 })
    await page.locator('.track-item').first().tap()
    await expect(page.locator('.now-playing-bar')).toBeVisible({ timeout: 20_000 })

    await page.locator('.npb-open').tap()
    await expect(page.locator('.now-playing-view')).toBeVisible()

    // Ce que la barre compacte a dû abandonner faute de place doit se retrouver
    // ici : précédent, aléatoire, répétition et la barre de progression.
    const view = page.locator('.now-playing-view')
    await expect(view.locator('.control-prev')).toBeVisible()
    await expect(view.locator('.control-shuffle')).toBeVisible()
    await expect(view.locator('.control-repeat')).toBeVisible()
    await expect(view.locator('.progress-bar')).toBeVisible()

    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1)
  })

  test('la grille de playlists reste lisible en portrait', async ({ page }) => {
    await page.goto(`${BASE}/library`)
    await page.locator('.import-block').first().locator('.search-input').fill('PLtest123456789')
    await page.getByRole('button', { name: 'Importer', exact: true }).tap()
    await expect(page.locator('.playlist-card')).toHaveCount(1, { timeout: 20_000 })

    const card = (await page.locator('.playlist-card').boundingBox())!
    expect(card.width).toBeGreaterThanOrEqual(140)
    expect(card.width).toBeLessThanOrEqual(PHONE.width)
  })
})

import { defineConfig } from '@playwright/test'

/**
 * Certains environnements fournissent déjà un Chromium et interdisent le
 * téléchargement d'un navigateur. `PLAYWRIGHT_CHROMIUM_PATH` permet alors de le
 * désigner ; sans cette variable, Playwright utilise son navigateur habituel.
 */
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH

/**
 * Les tests visent la **construction de production** servie par `vite preview`,
 * pas le serveur de développement.
 *
 * En dev, le plugin `vite-plugin-yt-audio` intercepte l'audio via yt-dlp : la
 * lecture marche toujours, y compris quand le vrai chemin Invidious/Piped est
 * cassé. C'est exactement ce qui masquait la panne de lecture en production.
 * Tester sur `preview` force le chemin réellement déployé sur GitHub Pages.
 */
export default defineConfig({
  testDir: './tests',
  testIgnore: ['helpers.ts'],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://localhost:4173/youtube-tesla/',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    port: 4173,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        ...(chromiumPath ? { launchOptions: { executablePath: chromiumPath } } : {}),
      },
    },
  ],
})

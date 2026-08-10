import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ytAudioProxy } from './vite-plugin-yt-audio'

export default defineConfig({
  plugins: [react(), ytAudioProxy()],
  base: '/youtube-tesla/',
  build: {
    outDir: 'docs',
    // Le navigateur embarqué Tesla est un Chromium ancien selon le millésime du
    // véhicule. La cible « modules » par défaut de Vite suppose un moteur récent
    // et peut produire une page blanche ; on descend explicitement.
    target: ['chrome87', 'safari14'],
  },
})

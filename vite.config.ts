import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ytAudioProxy } from './vite-plugin-yt-audio'

export default defineConfig({
  plugins: [react(), ytAudioProxy()],
  base: '/youtube-tesla/',
  build: {
    outDir: 'docs',
  },
})

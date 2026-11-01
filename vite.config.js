import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// En GitHub Pages el workflow define BASE_PATH=/<nombre-del-repo>/
const base = process.env.BASE_PATH || '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['moodzound.svg'],
      manifest: {
        name: 'MOODZOUND',
        short_name: 'MOODZOUND',
        description: 'Reproductor de música personal Hi-Fi',
        theme_color: '#111318',
        background_color: '#111318',
        display: 'standalone',
        start_url: base,
        scope: base,
        icons: [{ src: 'moodzound.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      // Los audios de mood_samples NO se precargan: se reproducen en streaming.
workbox: { navigateFallback: `${base}index.html`, navigateFallbackDenylist: [/\/about\//], globIgnores: ['mood_samples/**', 'about/**'], maximumFileSizeToCacheInBytes: 3_000_000 }    })
  ]
})

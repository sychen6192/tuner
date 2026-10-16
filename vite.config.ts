/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo>/, so the deploy workflow sets BASE_PATH.
const base = process.env.BASE_PATH ?? '/'
const themeColor = '#172036'

export default defineConfig({
  base,
  build: { target: 'es2022' },
  worker: { format: 'es' },
  plugins: [
    VitePWA({
      // "prompt" instead of "autoUpdate": never reload the page in the middle of tuning.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: base,
        name: 'Tuner 調音器',
        short_name: '調音器',
        description: '精準、可離線使用的調音器 PWA：真頻閃、音準軌跡、律制、移調、參考音。',
        lang: 'zh-Hant-TW',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: themeColor,
        theme_color: themeColor,
        categories: ['music', 'utilities', 'education'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // Take control of the page that installed the worker, so "Ready to work offline" is true
        // at once: the capture worklet and analysis worker load lazily, at the first Start.
        // Updates still wait for the user (no skipWaiting).
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
})

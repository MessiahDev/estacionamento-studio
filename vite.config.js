import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),

    VitePWA({
      registerType: 'autoUpdate',

      includeAssets: [
        'icon.svg',
      ],

      manifest: {
        name: 'Estacionamento Studio',
        short_name: 'Estacionamento',
        description: 'Controle de entrada e saída de veículos',
        theme_color: '#020617',
        background_color: '#f1f5f9',
        display: 'standalone',
        start_url: '/',

        icons: [
          {
            src: '/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})

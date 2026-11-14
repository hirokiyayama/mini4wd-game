import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 個人で遊ぶ用：ブレードとランチャーの画像つき（npm run build:bey-personal）
// 画像もJSもすべて1つの index.html に入れるので、ダウンロードしてそのまま開ける。公開用（build:bey）には画像は入らない
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false,
  build: {
    outDir: 'dist-bey-personal',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000, // 画像は data: URL で埋め込む
    rollupOptions: { input: 'bey-personal.html' },
  },
})

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// ベイブレードXだけを公開用にビルドする設定（npm run build:bey）
// 相対パス(base './')なので、どのフォルダ／ホストに置いても動く
export default defineConfig({
  plugins: [react()],
  base: './',
  publicDir: false, // ミニ四駆用の写真は含めない
  build: {
    outDir: 'dist-bey',
    emptyOutDir: true,
    rollupOptions: { input: 'bey.html' },
  },
})

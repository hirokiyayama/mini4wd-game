import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 同じWi-Fiのスマホなどからも開発サーバーにアクセスできるようにする
    host: true,
  },
})

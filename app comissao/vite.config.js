import { defineConfig } from 'vite'
// Trigger Rebuild
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/blacksalon/',
})

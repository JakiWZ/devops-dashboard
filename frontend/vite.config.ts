/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In sviluppo le chiamate /api vanno al backend Express, evitando CORS lato dev.
    proxy: { '/api': 'http://localhost:4000' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Gli E2E in e2e/ sono di Playwright.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});

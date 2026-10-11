import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En producción (Vercel) /api se reescribe a la API (ver vercel.json): web y API comparten dominio,
// así la cookie de sesión es de primera parte.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:3000' },
  },
});

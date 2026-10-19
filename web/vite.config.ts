import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Self-hosted OCR engine: copies the Tesseract worker, its LSTM-only wasm cores (the browser picks one
// of the three by CPU features) and every installed @tesseract.js-data/<lang> package into public/ocr/
// (gitignored), so dev and build serve them same-origin. Not precached: only OCR users download them.
function ocrFiles(): Plugin {
  const nm = (p: string) => fileURLToPath(new URL(`node_modules/${p}`, import.meta.url));
  const out = (p: string) => fileURLToPath(new URL(`public/ocr/${p}`, import.meta.url));
  return {
    name: 'ocr-files',
    config() {
      rmSync(out(''), { recursive: true, force: true });
      cpSync(nm('tesseract.js/dist/worker.min.js'), out('worker.min.js'));
      for (const v of ['', '-simd', '-relaxedsimd']) {
        cpSync(nm(`tesseract.js-core/tesseract-core${v}-lstm.wasm.js`), out(`core/tesseract-core${v}-lstm.wasm.js`));
      }
      const data = nm('@tesseract.js-data');
      for (const lang of existsSync(data) ? readdirSync(data) : []) {
        cpSync(nm(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`), out(`lang/${lang}.traineddata.gz`));
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [
    ocrFiles(),
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: { globPatterns: ['**/*.{js,css,html}'], globIgnores: ['ocr/**'] },
      manifest: {
        name: 'Card Wallet',
        short_name: 'Wallet',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
        share_target: {
          action: './share',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { files: [{ name: 'file', accept: ['image/*', 'application/pdf'] }] },
        },
      },
    }),
  ],
});

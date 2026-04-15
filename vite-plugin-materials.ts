import fs from 'fs';
import path from 'path';
import type { Plugin } from 'vite';

const PUBLIC_DIR = path.resolve(__dirname, 'public');

/**
 * Vite plugin that dynamically serves file listings from public/ subdirectories.
 * 
 * Endpoints:
 *   GET /__materials_manifest  → JSON array of image filenames in public/materials
 *   GET /__models_manifest     → JSON array of model filenames in public/models
 */
export function publicAssetsPlugin(): Plugin {
  const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tga', '.bmp']);
  const MODEL_EXTENSIONS = new Set(['.gltf', '.glb']);

  function scanDir(subDir: string, extensions: Set<string>): string[] {
    const fullPath = path.join(PUBLIC_DIR, subDir);
    try {
      if (!fs.existsSync(fullPath)) return [];
      return fs.readdirSync(fullPath)
        .filter(f => {
          const ext = path.extname(f).toLowerCase();
          return extensions.has(ext) && !f.startsWith('.');
        })
        .sort();
    } catch {
      return [];
    }
  }

  return {
    name: 'vite-plugin-public-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ? new URL(req.url, 'http://localhost').pathname : '';
        if (url === '/__materials_manifest') {
          const files = scanDir('materials', IMAGE_EXTENSIONS);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(JSON.stringify(files));
          return;
        }
        if (url === '/__models_manifest') {
          const files = scanDir('models', MODEL_EXTENSIONS);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(JSON.stringify(files));
          return;
        }
        next();
      });
    },
    // For production build: generate static manifest files
    closeBundle() {
      const outDir = path.resolve(__dirname, 'dist');
      if (fs.existsSync(outDir)) {
        fs.writeFileSync(
          path.join(outDir, '__materials_manifest'),
          JSON.stringify(scanDir('materials', IMAGE_EXTENSIONS))
        );
        fs.writeFileSync(
          path.join(outDir, '__models_manifest'),
          JSON.stringify(scanDir('models', MODEL_EXTENSIONS))
        );
      }
    }
  };
}

// Bundles main, preload and renderer with esbuild and copies static renderer files.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = { bundle: true, sourcemap: true, logLevel: 'info' };

await Promise.all([
  build({
    ...common,
    entryPoints: ['src/main/main.ts'],
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron', 'koffi'], // koffi ships a native module; load it from node_modules
    outfile: 'dist/main/main.js',
  }),
  build({
    // Speech worker: ESM so it can import kokoro-js (ESM-only) straight from node_modules.
    ...common,
    entryPoints: ['src/main/ttsWorker.ts'],
    platform: 'node',
    target: 'node20',
    format: 'esm',
    external: ['kokoro-js'],
    outfile: 'dist/main/ttsWorker.mjs',
  }),
  build({
    ...common,
    entryPoints: ['src/preload/preload.ts'],
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    external: ['electron'],
    outfile: 'dist/preload/preload.js',
  }),
  build({
    ...common,
    entryPoints: ['src/renderer/renderer.ts'],
    platform: 'browser',
    target: 'chrome120',
    format: 'iife',
    outfile: 'dist/renderer/renderer.js',
  }),
]);

mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/style.css', 'dist/renderer/style.css');

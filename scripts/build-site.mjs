// Builds the landing page in docs/ (served by GitHub Pages from the main branch's /docs folder):
// bundles the live robot demo and copies the model and preview images next to docs/index.html.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';

await build({
  entryPoints: ['site/demo.ts'],
  bundle: true,
  minify: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
  outfile: 'docs/demo.js',
  logLevel: 'info',
});

mkdirSync('docs/images', { recursive: true });
copyFileSync('assets/robot.glb', 'docs/robot.glb');
copyFileSync('blender/previews/tour_sheet.png', 'docs/images/tour_sheet.png');
copyFileSync('blender/previews/new_moods_sheet.png', 'docs/images/new_moods_sheet.png');
// Serve the folder as-is (no Jekyll processing).
writeFileSync('docs/.nojekyll', '');

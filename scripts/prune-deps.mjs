// Runs after `npm install`. onnxruntime-node (the speech engine behind kokoro-js) ships native builds for
// Windows, macOS and Linux (~70 MB each); only the one for this OS is ever loaded, so the others are removed.
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const binRoot = join('node_modules', 'onnxruntime-node', 'bin');
if (!existsSync(binRoot)) process.exit(0);

let freed = 0;
for (const napi of readdirSync(binRoot)) {
  const napiDir = join(binRoot, napi);
  for (const platform of readdirSync(napiDir)) {
    if (platform === process.platform) continue;
    rmSync(join(napiDir, platform), { recursive: true, force: true });
    freed++;
  }
}
if (freed) console.log(`prune-deps: removed ${freed} onnxruntime build(s) for other platforms`);

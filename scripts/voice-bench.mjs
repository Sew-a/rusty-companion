// Measures how long Kokoro takes to generate speech on this machine (no audio is played).
//   node scripts/voice-bench.mjs [q8|fp32|fp16|q4]   (default q8; other types download on first use)
import { KokoroTTS } from 'kokoro-js';
import os from 'node:os';

const dtype = process.argv[2] ?? 'q8';

const tests = [
  ['short phrase', 'Done!'],
  ['first clause', 'All done, Sev.'],
  ['one sentence', 'I fixed the bug and all the tests pass now.'],
  ['long sentence', 'I made the robot voice stronger and a bit slower, and now I read the first three sentences.'],
];

console.log(`CPU: ${os.cpus()[0].model.trim()}, ${os.cpus().length} logical cores, model: ${dtype}`);
let t = Date.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype, device: 'cpu' });
console.log(`model load: ${Date.now() - t} ms`);

await tts.generate('Warm up.', { voice: 'am_fenrir', speed: 0.85 }); // first run is slower
for (const [label, text] of tests) {
  t = Date.now();
  const a = await tts.generate(text, { voice: 'am_fenrir', speed: 0.85 });
  const ms = Date.now() - t;
  const secs = a.audio.length / a.sampling_rate;
  console.log(`${label.padEnd(14)} ${String(ms).padStart(5)} ms to make ${secs.toFixed(1)} s of speech (x${(ms / 1000 / secs).toFixed(2)})`);
}

// Generates a sample clip for each Kokoro voice: the plain voice, a short pause, then the same line
// with a light "robot" effect (pitched up a little and slightly bit-crushed).
//   node scripts/voice-samples.mjs
// The Kokoro-82M model (Apache-2.0) is downloaded from Hugging Face on first run (~90 MB, 8-bit).
import { KokoroTTS } from 'kokoro-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('voice-samples');
const TEXT = "Hi Sev! I finished the task, and all the tests pass. Want me to open the browser?";
const VOICES = ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_george'];

/** Pitch up by resampling (also slightly faster), then mix in a bit-crushed copy. */
function robotize(samples, pitch = 1.18, bits = 9, crushMix = 0.35) {
  const out = new Float32Array(Math.floor(samples.length / pitch));
  const levels = 2 ** (bits - 1);
  for (let i = 0; i < out.length; i++) {
    const pos = i * pitch;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s = (samples[i0] ?? 0) * (1 - frac) + (samples[i0 + 1] ?? 0) * frac;
    const crushed = Math.round(s * levels) / levels;
    out[i] = s * (1 - crushMix) + crushed * crushMix;
  }
  return out;
}

function wav(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  return buf;
}

mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
console.log(`model loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

for (const voice of VOICES) {
  const t = Date.now();
  const audio = await tts.generate(TEXT, { voice });
  const rate = audio.sampling_rate;
  const plain = audio.audio;
  const robot = robotize(plain);
  const gap = new Float32Array(Math.round(rate * 0.7));
  const all = new Float32Array(plain.length + gap.length + robot.length);
  all.set(plain, 0);
  all.set(robot, plain.length + gap.length);
  writeFileSync(path.join(OUT, `${voice}.wav`), wav(all, rate));
  const secs = plain.length / rate;
  console.log(`${voice}: ${secs.toFixed(1)} s of speech, generated in ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

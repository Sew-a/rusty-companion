/**
 * Text-to-speech worker thread. Runs Kokoro-82M (Apache-2.0, fp32 weights) on the CPU so speech generation never
 * blocks the Electron main process. Speaks one sentence at a time so audio starts early.
 *
 * Messages in:  { type: 'speak', id, text, voice } | { type: 'cancel' }
 * Messages out: { type: 'ready' } | { type: 'chunk', id, rate, samples } | { type: 'end', id }
 *               | { type: 'error', message }
 */
import { parentPort } from 'node:worker_threads';
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

type InMsg = { type: 'speak'; id: number; text: string; voice: string; speed: number } | { type: 'cancel' };

const port = parentPort!;
let current = 0;

// fp32: on this CPU it makes speech ~3x faster than real time; the 8-bit (q8) model was slower than
// real time because of its quantize/dequantize overhead (see scripts/voice-bench.mjs).
const ttsReady = KokoroTTS.from_pretrained(MODEL, { dtype: 'fp32', device: 'cpu' }).then(
  async (tts) => {
    // The first generation is always slower; do it now so the first real line starts quickly.
    await tts.generate('Hi.', { voice: 'am_fenrir' as never });
    port.postMessage({ type: 'ready' });
    return tts;
  },
  (err: unknown) => {
    port.postMessage({ type: 'error', message: `model load failed: ${(err as Error).message}` });
    throw err;
  },
);

/** Words in the first chunk. Kokoro makes ~1 s of speech per second on this CPU and nothing plays
 *  until a chunk is finished, so a short first chunk makes the voice start quickly. */
const FIRST_CHUNK_WORDS = 5;
/** Later chunks stay short too, so the next one is (nearly) ready when the current one ends. */
// With the fp32 model, generation runs ~2-3x faster than playback, so later chunks can be close to
// whole sentences (fewer cuts = more natural phrasing) without causing pauses.
const MAX_CHUNK_WORDS = 18;
const SECOND_CHUNK_WORDS = 12;

/** Cut a sentence into pieces of at most `max` words, preferring to cut right after a comma. */
function cutWords(sentence: string, max: number): string[] {
  const words = sentence.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  while (words.length > max) {
    // Look for a comma/semicolon within the allowed range, from the far end backwards.
    let cut = max;
    for (let i = max; i >= Math.ceil(max / 2); i--) {
      if (/[,;:]$/.test(words[i - 1])) {
        cut = i;
        break;
      }
    }
    // Don't leave a tiny tail behind.
    if (words.length - cut < 3) cut = words.length;
    out.push(words.splice(0, cut).join(' '));
  }
  if (words.length) out.push(words.join(' '));
  return out;
}

/** Split text into speakable chunks: a short opening phrase, then pieces of up to ~10 words. */
function chunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [];
  const out: string[] = [];
  sentences.forEach((s, i) => {
    if (i === 0) {
      // Ramp up: 5 words, then 7, then up to 10, so the gap after the opening phrase stays short.
      const [head, ...rest] = cutWords(s, FIRST_CHUNK_WORDS);
      out.push(head);
      if (rest.length) {
        const [second, ...more] = cutWords(rest.join(' '), SECOND_CHUNK_WORDS);
        out.push(second);
        if (more.length) out.push(...cutWords(more.join(' '), MAX_CHUNK_WORDS));
      }
    } else {
      out.push(...cutWords(s, MAX_CHUNK_WORDS));
    }
  });
  return out.filter(Boolean);
}

/** Only one generation at a time: two at once fight over the CPU and both get much slower. */
let busy: Promise<unknown> = Promise.resolve();
function exclusive<T>(job: () => Promise<T>): Promise<T> {
  const run = busy.then(job, job);
  busy = run.catch(() => undefined);
  return run;
}

port.on('message', async (msg: InMsg) => {
  if (msg.type === 'cancel') {
    current = 0;
    return;
  }
  const { id, text, voice, speed } = msg;
  current = id; // any older line stops after its current chunk
  try {
    const tts = await ttsReady;
    for (const sentence of chunks(text)) {
      if (current !== id) return; // superseded by a newer line
      const queuedAt = Date.now();
      let startedAt = 0;
      const audio = await exclusive(() => {
        startedAt = Date.now();
        return current === id ? tts.generate(sentence, { voice: voice as never, speed }) : Promise.resolve(null);
      });
      if (!audio) return;
      const secs = audio.audio.length / audio.sampling_rate;
      port.postMessage({
        type: 'log',
        message: `chunk "${sentence.slice(0, 40)}" waited ${startedAt - queuedAt} ms, made ${secs.toFixed(1)} s in ${Date.now() - startedAt} ms`,
      });
      if (current !== id) return;
      const samples = new Float32Array(audio.audio); // own copy, safe to transfer
      port.postMessage({ type: 'chunk', id, rate: audio.sampling_rate, samples }, [samples.buffer]);
    }
    if (current === id) port.postMessage({ type: 'end', id });
  } catch (err) {
    port.postMessage({ type: 'error', message: (err as Error).message });
    port.postMessage({ type: 'end', id });
  }
});

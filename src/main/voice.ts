import path from 'node:path';
import { Worker } from 'node:worker_threads';

export const VOICE = 'am_fenrir';
/** Kokoro speaking speed. Below 1 because the pitch-up in robotize() also speeds speech up. */
export const SPEED = 0.85;

/** Robot effect: pitch up by resampling, mix in a bit-crushed copy, and add a faint metallic ring
 *  (amplitude modulation). */
export function robotize(
  samples: Float32Array,
  rate: number,
  { pitch = 1.18, bits = 8, crushMix = 0.5, ringHz = 45, ringDepth = 0.22 } = {},
): Float32Array {
  const out = new Float32Array(Math.floor(samples.length / pitch));
  const levels = 2 ** (bits - 1);
  for (let i = 0; i < out.length; i++) {
    const pos = i * pitch;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s = (samples[i0] ?? 0) * (1 - frac) + (samples[i0 + 1] ?? 0) * frac;
    const crushed = Math.round(s * levels) / levels;
    const ring = 1 - ringDepth + ringDepth * Math.sin((2 * Math.PI * ringHz * i) / rate);
    out[i] = (s * (1 - crushMix) + crushed * crushMix) * ring;
  }
  return out;
}

export interface VoiceChunk {
  id: number;
  rate: number;
  samples: Float32Array;
}

/** Owns the TTS worker thread. Each speak() supersedes the previous line. */
export class Voice {
  private worker: Worker;
  private nextId = 1;
  /** When each line was requested, to log how long until its first audio. */
  private startedAt = new Map<number, number>();

  constructor(
    onChunk: (chunk: VoiceChunk) => void,
    onEnd: (id: number) => void,
    onLog: (line: string) => void,
  ) {
    this.worker = new Worker(path.join(__dirname, 'ttsWorker.mjs'));
    this.worker.on('message', (m: { type: string; id: number; rate: number; samples: Float32Array; message: string }) => {
      if (m.type === 'chunk') {
        const started = this.startedAt.get(m.id);
        if (started !== undefined) {
          onLog(`first audio after ${Date.now() - started} ms`);
          this.startedAt.delete(m.id);
        }
        onChunk({ id: m.id, rate: m.rate, samples: robotize(m.samples, m.rate) });
      }
      else if (m.type === 'end') onEnd(m.id);
      else if (m.type === 'ready') onLog('voice model ready');
      else if (m.type === 'error') onLog(`voice error: ${m.message}`);
      else if (m.type === 'log') onLog(m.message);
    });
    this.worker.on('error', (err: Error) => onLog(`voice worker crashed: ${err.message}`));
  }

  speak(text: string): number {
    const id = this.nextId++;
    this.startedAt.set(id, Date.now());
    this.worker.postMessage({ type: 'speak', id, text, voice: VOICE, speed: SPEED });
    return id;
  }

  cancel(): void {
    this.worker.postMessage({ type: 'cancel' });
  }
}

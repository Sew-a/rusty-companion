/** Plays the robot's speech (audio chunks from the TTS worker) and measures loudness for the mouth. */
export class Speaker {
  private ctx = new AudioContext();
  private analyser: AnalyserNode;
  private buf: Float32Array<ArrayBuffer>;
  private currentId = 0;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private level = 0;

  constructor() {
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.analyser.connect(this.ctx.destination);
    this.buf = new Float32Array(this.analyser.fftSize);
    window.companion.onVoiceChunk((c) => this.play(c.id, c.rate, c.samples));
  }

  /** Speak a line, cutting off whatever was being said. */
  async say(text: string): Promise<void> {
    this.stop();
    const id = await window.companion.speak(text);
    if (id) this.currentId = id;
  }

  stop(): void {
    this.currentId = -1;
    for (const s of this.sources) s.stop();
    this.sources.clear();
    this.nextTime = 0;
  }

  get speaking(): boolean {
    return this.sources.size > 0;
  }

  private play(id: number, rate: number, samples: Float32Array): void {
    if (id !== this.currentId) return; // a stale line that was cut off
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    const buffer = this.ctx.createBuffer(1, samples.length, rate);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.analyser);
    // Queue chunks back to back with a tiny breath (chunks can be mid-sentence, so keep it short).
    const start = Math.max(this.ctx.currentTime + 0.03, this.nextTime);
    src.start(start);
    this.nextTime = start + buffer.duration + 0.06;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** Mouth openness 0..1 from the current loudness, smoothed and stepped into 4 levels. */
  mouth(): number | null {
    if (!this.speaking) {
      this.level = 0;
      return null;
    }
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (const v of this.buf) sum += v * v;
    const rms = Math.sqrt(sum / this.buf.length);
    this.level += (Math.min(1, rms * 7) - this.level) * 0.5;
    return Math.round(this.level * 3) / 3;
  }
}

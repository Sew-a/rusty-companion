import * as THREE from 'three';
import type { Mood } from './stateMachine';

// Must match the Screen quad's aspect in blender/build_robot.py (height = 0.8 x width).
const W = 256;
const H = 205;
const SCREEN_BG = '#f4ede4';
const INK = '#2b211c';

/** The robot's screen face, drawn on a canvas each frame and used as a texture. */
export class Face {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private nextBlink = 2 + Math.random() * 4;
  private blinkUntil = 0;
  /** Eye direction in -1..1 (x right, y down), e.g. towards the mouse cursor. */
  private gx = 0;
  private gy = 0;

  /** Mouth openness 0..1 while speaking (overrides the expression's mouth), or null when silent. */
  private mouthOpen: number | null = null;

  setMouth(level: number | null): void {
    this.mouthOpen = level;
  }

  setGaze(x: number, y: number): void {
    // Light smoothing so the eyes don't jitter.
    this.gx += (x - this.gx) * 0.3;
    this.gy += (y - this.gy) * 0.3;
  }

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
  }

  draw(mood: Mood, t: number): void {
    const c = this.ctx;
    c.fillStyle = SCREEN_BG;
    c.fillRect(0, 0, W, H);
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (t > this.nextBlink) {
      this.blinkUntil = t + 0.12;
      this.nextBlink = t + 2 + Math.random() * 4;
    }
    const blinking = t < this.blinkUntil;
    const ex = 78; // eye x offset from centre
    const ey = 75;
    const cx = W / 2;

    switch (mood) {
      case 'happy':
        this.xEye(cx - ex, ey);
        this.xEye(cx + ex, ey);
        this.smile(cx, 118, 62, 30);
        break;
      case 'greet':
        this.dotEyes(cx, ex, ey, blinking);
        this.smile(cx, 115, 55, 32);
        break;
      case 'browsing':
        // Sketch 2: mischievous brows and a big grin.
        this.line(cx - ex - 22, ey - 32, cx - ex + 18, ey - 22);
        this.line(cx + ex + 22, ey - 32, cx + ex - 18, ey - 22);
        this.ringEyes(cx, ex, ey + 4, blinking);
        this.grin(cx, 118, 60, 34);
        break;
      case 'thinking': {
        const look = Math.sin(t * 1.5) * 8;
        this.dot(cx - ex + look, ey - 10, 10);
        this.dot(cx + ex + look, ey - 10, 10);
        this.line(cx - 24, 132, cx + 24, 132);
        break;
      }
      case 'working':
        this.line(cx - ex - 18, ey - 26, cx - ex + 18, ey - 20);
        this.line(cx + ex + 18, ey - 26, cx + ex - 18, ey - 20);
        this.dotEyes(cx, ex, ey, blinking);
        this.line(cx - 30, 130, cx + 30, 130);
        break;
      case 'permission':
        this.dot(cx - ex, ey, 14);
        this.dot(cx + ex, ey, 14);
        c.beginPath();
        c.arc(cx, 132, 14, 0, Math.PI * 2);
        c.stroke();
        c.font = 'bold 48px Segoe UI, sans-serif';
        c.textAlign = 'center';
        c.fillText('?', W - 30, 54);
        break;
      case 'talking': {
        this.dotEyes(cx, ex, ey, blinking);
        const open = 0.3 + 0.7 * Math.abs(Math.sin(t * 9) * Math.sin(t * 4.3));
        c.beginPath();
        c.ellipse(cx, 128, 30, 4 + 18 * open, 0, 0, Math.PI * 2);
        c.fill();
        break;
      }
      case 'error':
        // Sketch 3: sad, wobbly mouth.
        this.dot(cx - ex, ey, 10);
        this.dot(cx + ex, ey, 10);
        this.wavyMouth(cx, 135, t);
        break;
      case 'sleep':
      case 'bye':
        // Sketch 4: closed eyes, small "o" mouth.
        this.closedEye(cx - ex, ey);
        this.closedEye(cx + ex, ey);
        c.beginPath();
        c.ellipse(cx, 132, 10, 13, 0, 0, Math.PI * 2);
        c.stroke();
        if (mood === 'sleep') {
          c.font = 'bold 26px Segoe UI, sans-serif';
          c.textAlign = 'center';
          c.fillText('z', W - 40, 50 - (t * 6) % 12);
        }
        break;
      case 'idle':
      default:
        // Flat-front sketch: dot eyes, flat mouth with small upturned ticks at both ends.
        this.dotEyes(cx, ex, ey, blinking);
        this.tickedMouth(cx, 128, 34);
        break;
    }
    if (this.mouthOpen !== null) {
      // Speaking: replace the expression's mouth with one that opens with the voice's loudness.
      c.fillStyle = SCREEN_BG;
      c.fillRect(40, 104, W - 80, 66);
      c.fillStyle = INK;
      c.beginPath();
      c.ellipse(cx, 130, 26, 3 + 17 * this.mouthOpen, 0, 0, Math.PI * 2);
      c.fill();
    }
    this.texture.needsUpdate = true;
  }

  private line(x1: number, y1: number, x2: number, y2: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.stroke();
  }

  private dot(x: number, y: number, r: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  private dotEyes(cx: number, ex: number, ey: number, blinking: boolean): void {
    cx += this.gx * 12;
    ey += this.gy * 9;
    if (blinking) {
      this.line(cx - ex - 12, ey, cx - ex + 12, ey);
      this.line(cx + ex - 12, ey, cx + ex + 12, ey);
    } else {
      this.dot(cx - ex, ey, 11);
      this.dot(cx + ex, ey, 11);
    }
  }

  private ringEyes(cx: number, ex: number, ey: number, blinking: boolean): void {
    if (blinking) return this.dotEyes(cx, ex, ey, true);
    const c = this.ctx;
    for (const x of [cx - ex, cx + ex]) {
      c.beginPath();
      c.arc(x, ey, 13, 0, Math.PI * 2);
      c.stroke();
      this.dot(x + this.gx * 6, ey + this.gy * 6, 5);
    }
  }

  private xEye(x: number, y: number): void {
    const s = 14;
    this.line(x - s, y - s, x + s, y + s);
    this.line(x + s, y - s, x - s, y + s);
  }

  private closedEye(x: number, y: number): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(x, y - 8, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    c.stroke();
  }

  /** Smile with small dimple ticks at the corners (as in the waving sketch). */
  private smile(cx: number, y: number, w: number, depth: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx - w, y);
    c.quadraticCurveTo(cx, y + depth * 2, cx + w, y);
    c.stroke();
    c.lineWidth = 5;
    this.line(cx - w - 6, y - 8, cx - w + 4, y + 4);
    this.line(cx + w + 6, y - 8, cx + w - 4, y + 4);
    c.lineWidth = 7;
  }

  /** Flat mouth whose ends curl up slightly. */
  private tickedMouth(cx: number, y: number, w: number): void {
    const c = this.ctx;
    this.line(cx - w, y, cx + w, y);
    c.lineWidth = 5;
    this.line(cx - w - 8, y - 7, cx - w, y);
    this.line(cx + w + 8, y - 7, cx + w, y);
    c.lineWidth = 7;
  }

  private grin(cx: number, y: number, w: number, depth: number): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(cx - w, y);
    c.quadraticCurveTo(cx, y + depth * 2, cx + w, y);
    c.closePath();
    c.fill();
  }

  private wavyMouth(cx: number, y: number, t: number): void {
    const c = this.ctx;
    c.beginPath();
    for (let i = 0; i <= 20; i++) {
      const x = cx - 40 + i * 4;
      const yy = y + Math.sin(i * 0.9 + t * 4) * 5 + (Math.abs(i - 10) < 6 ? -6 : 0);
      if (i === 0) c.moveTo(x, yy);
      else c.lineTo(x, yy);
    }
    c.stroke();
  }
}

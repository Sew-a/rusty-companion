import type { Mood } from './stateMachine';

/** Quiet time before Rusty gets tired and sits down (seconds). */
export const TIRED_AFTER = 4 * 60;
/** Late at night he tires sooner. */
export const TIRED_AFTER_NIGHT = 2 * 60;
/** How long the yawn and stretch lasts before he sits (seconds). */
export const YAWN_SECONDS = 2.4;
/** Something waiting on Sev this long gets one knock on the screen (seconds). */
export const NUDGE_AFTER = 60;
/** A morning sip lasts this long (seconds). */
export const SIP_SECONDS = 5;

export type DayPart = 'morning' | 'day' | 'night';

/** Morning 5–11, night 23–5, day otherwise (local hours). */
export function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 23 || hour < 5) return 'night';
  return 'day';
}

export type IdleAction =
  /** Yawn and stretch, then sit down (followed by 'rest'). */
  | 'yawn'
  /** Sit down on the taskbar and relax. */
  | 'rest'
  /** A short late-night yawn that doesn't lead to sitting. */
  | 'nightYawn'
  /** Knock on the screen: something waits on Sev. */
  | 'nudge'
  /** Morning: sip from the mug. */
  | 'sip';

export interface IdleContext {
  t: number;
  hour: number;
  mood: Mood;
  /** Being dragged, walking, sprinting or playing a clip: don't start anything now. */
  busyBody: boolean;
}

/**
 * Decides Rusty's own idle behaviour: getting tired and sitting down, morning sips, late-night
 * yawns and the waiting nudge. Pure (time, hour and randomness are passed in) so it is testable.
 */
export class IdleScheduler {
  private lastActivity: number;
  private phase: 'awake' | 'yawning' | 'resting' = 'awake';
  private yawnEnd = 0;
  private waitingSince: number | null = null;
  private nudged = false;
  private nextSip: number;
  private nextNightYawn: number;

  constructor(t: number, private rand: () => number = Math.random) {
    this.lastActivity = t;
    this.nextSip = t + 20 + rand() * 40;
    this.nextNightYawn = t + 40 + rand() * 60;
  }

  get resting(): boolean {
    return this.phase === 'resting';
  }

  /** Any Claude event, click or drag. Returns true if Rusty was resting (and should stand up). */
  activity(t: number): boolean {
    this.lastActivity = t;
    const wasDown = this.phase !== 'awake';
    this.phase = 'awake';
    return wasDown;
  }

  /** Get tired at the next tick (tray test). */
  tireNow(): void {
    this.lastActivity = -Infinity;
  }

  /** Claude started waiting on Sev (or stopped, with false). */
  setWaiting(waiting: boolean, t: number): void {
    if (waiting) {
      this.waitingSince = t;
      this.nudged = false;
    } else {
      this.waitingSince = null;
    }
  }

  tick(ctx: IdleContext): IdleAction | null {
    const { t, mood } = ctx;
    const part = dayPart(ctx.hour);

    if (this.waitingSince !== null && !this.nudged && t - this.waitingSince >= NUDGE_AFTER) {
      this.nudged = true;
      return 'nudge';
    }
    if (this.phase === 'yawning') {
      if (t < this.yawnEnd) return null;
      this.phase = 'resting';
      return 'rest';
    }
    if (this.phase === 'resting' || mood !== 'idle' || ctx.busyBody) return null;

    const tiredAfter = part === 'night' ? TIRED_AFTER_NIGHT : TIRED_AFTER;
    if (t - this.lastActivity >= tiredAfter) {
      this.phase = 'yawning';
      this.yawnEnd = t + YAWN_SECONDS;
      return 'yawn';
    }
    if (part === 'morning' && t >= this.nextSip) {
      this.nextSip = t + 60 + this.rand() * 90;
      return 'sip';
    }
    if (part === 'night' && t >= this.nextNightYawn) {
      this.nextNightYawn = t + 50 + this.rand() * 70;
      return 'nightYawn';
    }
    return null;
  }
}

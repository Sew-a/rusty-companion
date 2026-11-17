import { describe, expect, it } from 'vitest';
import {
  dayPart,
  IdleScheduler,
  NUDGE_AFTER,
  TIRED_AFTER,
  TIRED_AFTER_NIGHT,
  YAWN_SECONDS,
} from '../src/renderer/idleScheduler';
import type { Mood } from '../src/renderer/stateMachine';

const DAY = 14;
const ctx = (t: number, mood: Mood = 'idle', hour = DAY, busyBody = false) => ({ t, mood, hour, busyBody });
const fixed = () => 0.5;

describe('dayPart', () => {
  it.each([
    [4, 'night'],
    [5, 'morning'],
    [10, 'morning'],
    [11, 'day'],
    [22, 'day'],
    [23, 'night'],
    [0, 'night'],
  ])('%i h is %s', (h, part) => {
    expect(dayPart(h)).toBe(part);
  });
});

describe('IdleScheduler tired and resting', () => {
  it('yawns after the quiet time, then sits down', () => {
    const s = new IdleScheduler(0, fixed);
    expect(s.tick(ctx(TIRED_AFTER - 1))).toBeNull();
    expect(s.tick(ctx(TIRED_AFTER))).toBe('yawn');
    expect(s.tick(ctx(TIRED_AFTER + 1))).toBeNull();
    expect(s.tick(ctx(TIRED_AFTER + YAWN_SECONDS))).toBe('rest');
    expect(s.resting).toBe(true);
    expect(s.tick(ctx(TIRED_AFTER + 999))).toBeNull();
  });

  it('stands up on any activity', () => {
    const s = new IdleScheduler(0, fixed);
    s.tick(ctx(TIRED_AFTER));
    s.tick(ctx(TIRED_AFTER + YAWN_SECONDS));
    expect(s.activity(TIRED_AFTER + 10)).toBe(true);
    expect(s.resting).toBe(false);
    expect(s.activity(TIRED_AFTER + 11)).toBe(false);
  });

  it('does not tire while Claude is busy or the body is moving', () => {
    const s = new IdleScheduler(0, fixed);
    expect(s.tick(ctx(TIRED_AFTER, 'working'))).toBeNull();
    expect(s.tick(ctx(TIRED_AFTER, 'idle', DAY, true))).toBeNull();
  });

  it('tires sooner late at night', () => {
    const s = new IdleScheduler(0, () => 1); // pushes the night yawn past the test window
    expect(s.tick(ctx(TIRED_AFTER_NIGHT, 'idle', 23))).toBe('yawn');
  });
});

describe('IdleScheduler nudge', () => {
  it('knocks once after something waited on Sev', () => {
    const s = new IdleScheduler(0, fixed);
    s.setWaiting(true, 10);
    expect(s.tick(ctx(10 + NUDGE_AFTER - 1, 'permission'))).toBeNull();
    expect(s.tick(ctx(10 + NUDGE_AFTER, 'permission'))).toBe('nudge');
    expect(s.tick(ctx(10 + NUDGE_AFTER * 3, 'permission'))).toBeNull();
  });

  it('does not knock once answered', () => {
    const s = new IdleScheduler(0, fixed);
    s.setWaiting(true, 0);
    s.setWaiting(false, 5);
    expect(s.tick(ctx(NUDGE_AFTER + 5, 'idle'))).toBeNull();
  });
});

describe('IdleScheduler time of day', () => {
  it('sips from the mug in the morning only', () => {
    const morning = new IdleScheduler(0, fixed);
    expect(morning.tick(ctx(60, 'idle', 8))).toBe('sip');
    expect(morning.tick(ctx(61, 'idle', 8))).toBeNull();
    const day = new IdleScheduler(0, fixed);
    expect(day.tick(ctx(60, 'idle', DAY))).toBeNull();
  });

  it('yawns now and then late at night', () => {
    const s = new IdleScheduler(0, fixed);
    expect(s.tick(ctx(80, 'idle', 1))).toBe('nightYawn');
  });
});

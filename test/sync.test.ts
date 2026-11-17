import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(__dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const blender = read('blender/build_robot.py');

/** Parses `{"Hop": (1, 17), ...}` (Python) or `{ Hop: [1, 17], ... }` (TypeScript) into a map. */
function clipTable(src: string): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const m of src.matchAll(/["']?(\w+)["']?\s*:\s*[[(]\s*(\d+)\s*,\s*(\d+)\s*[\])]/g)) {
    out[m[1]] = [Number(m[2]), Number(m[3])];
  }
  return out;
}

describe('things that must stay in sync', () => {
  it('CLIPS frame ranges match between the Blender script and robot.ts', () => {
    const py = blender.match(/^CLIPS = (\{.*\})$/m)?.[1];
    const ts = read('src/renderer/robot.ts').match(/export const CLIPS = (\{.*\})/)?.[1];
    expect(py && ts).toBeTruthy();
    expect(clipTable(py!)).toEqual(clipTable(ts!));
    expect(Object.keys(clipTable(py!)).length).toBeGreaterThan(0);
  });

  it('screen aspect matches the face canvas', () => {
    const aspect = Number(blender.match(/screen_aspect=([\d.]+)/)![1]);
    const face = read('src/renderer/face.ts');
    const w = Number(face.match(/const W = (\d+)/)![1]);
    const h = Number(face.match(/const H = (\d+)/)![1]);
    expect(Math.abs(h / w - aspect)).toBeLessThan(0.01);
  });

  it('the model script builds every part the app looks for', () => {
    const robot = read('src/renderer/robot.ts');
    for (const part of ['Body', 'Screen', 'ArmL', 'ArmR', 'LegL', 'LegR', 'Root', 'Notepad', 'Mug']) {
      expect(blender, `blender part ${part}`).toMatch(new RegExp(`["']${part}["']`));
      expect(robot, `robot.ts looks up ${part}`).toContain(`'${part}'`);
    }
  });

  it('every spoken skill ends replies with the marker the app reads', () => {
    const marker = '<!-- rusty:discussion -->';
    expect(read('src/renderer/stateMachine.ts')).toContain('rusty:discussion');
    const skills = fs.readdirSync(path.join(root, 'extras')).filter((d) => d.endsWith('-skill'));
    expect(skills.length).toBeGreaterThanOrEqual(4);
    for (const dir of skills) expect(read(`extras/${dir}/SKILL.md`), dir).toContain(marker);
  });
});

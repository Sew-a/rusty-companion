import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startHookServer } from '../src/main/hookServer';
import type { HookEvent } from '../src/shared/events';

let close: (() => void) | null = null;
afterEach(() => close?.());

async function start(): Promise<{ url: string; events: HookEvent[] }> {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const events: HookEvent[] = [];
  const server = startHookServer(0, (e) => events.push(e));
  await new Promise<void>((r) => server.once('listening', () => r()));
  close = () => server.close();
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, events };
}

const post = (url: string, body: string) =>
  fetch(`${url}/event`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

describe('hook server', () => {
  it('answers {} and forwards the event', async () => {
    const { url, events } = await start();
    const res = await post(url, JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{}');
    expect(events).toEqual([{ hook_event_name: 'Stop', session_id: 's' }]);
  });

  it('never returns a decision for permission requests', async () => {
    const { url } = await start();
    const res = await post(url, JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash' }));
    expect(await res.text()).toBe('{}');
  });

  it('survives malformed bodies and unknown paths', async () => {
    const { url, events } = await start();
    expect(await (await post(url, '{not json')).text()).toBe('{}');
    expect(events).toEqual([]);
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect((await fetch(`${url}/nope`)).status).toBe(404);
  });
});

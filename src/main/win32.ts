/** Minimal Win32 bindings (via koffi FFI) to find the active window and its exact bounds. */
import koffi from 'koffi';

export interface ForegroundWindow {
  hwnd: number;
  pid: number;
  className: string;
  exe: string;
  minimized: boolean;
  maximized: boolean;
  /** Visible frame bounds in physical screen pixels (no invisible resize borders). */
  rect: { x: number; y: number; width: number; height: number };
}

const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

let api: ReturnType<typeof bind> | null = null;

function bind() {
  const user32 = koffi.load('user32.dll');
  const dwmapi = koffi.load('dwmapi.dll');
  const kernel32 = koffi.load('kernel32.dll');
  koffi.struct('RECT', { left: 'int32_t', top: 'int32_t', right: 'int32_t', bottom: 'int32_t' });
  return {
    GetForegroundWindow: user32.func('intptr_t __stdcall GetForegroundWindow()'),
    IsIconic: user32.func('bool __stdcall IsIconic(intptr_t hwnd)'),
    IsZoomed: user32.func('bool __stdcall IsZoomed(intptr_t hwnd)'),
    GetWindowRect: user32.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ RECT *rect)'),
    GetClassNameW: user32.func('int __stdcall GetClassNameW(intptr_t hwnd, void *buf, int max)'),
    GetWindowThreadProcessId: user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hwnd, _Out_ uint32_t *pid)'),
    DwmGetWindowAttribute: dwmapi.func(
      'long __stdcall DwmGetWindowAttribute(intptr_t hwnd, uint32_t attr, _Out_ RECT *pv, uint32_t cb)',
    ),
    OpenProcess: kernel32.func('intptr_t __stdcall OpenProcess(uint32_t access, bool inherit, uint32_t pid)'),
    QueryFullProcessImageNameW: kernel32.func(
      'bool __stdcall QueryFullProcessImageNameW(intptr_t h, uint32_t flags, void *buf, _Inout_ uint32_t *size)',
    ),
    CloseHandle: kernel32.func('bool __stdcall CloseHandle(intptr_t h)'),
  };
}

const exeCache = new Map<number, string>();

function exeName(pid: number): string {
  const cached = exeCache.get(pid);
  if (cached !== undefined) return cached;
  let name = '';
  const h = api!.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);
  if (h) {
    const buf = Buffer.alloc(1040);
    const size = [520];
    if (api!.QueryFullProcessImageNameW(h, 0, buf, size)) {
      const full = buf.toString('utf16le', 0, size[0] * 2);
      name = full.split('\\').pop()?.toLowerCase() ?? '';
    }
    api!.CloseHandle(h);
  }
  exeCache.set(pid, name);
  return name;
}

export function foregroundWindow(): ForegroundWindow | null {
  if (process.platform !== 'win32') return null;
  try {
    api ??= bind();
    const hwnd = Number(api.GetForegroundWindow());
    if (!hwnd) return null;

    const pidOut = [0];
    api.GetWindowThreadProcessId(hwnd, pidOut);
    const pid = pidOut[0];

    const cls = Buffer.alloc(512);
    const len = api.GetClassNameW(hwnd, cls, 256);
    const className = cls.toString('utf16le', 0, Math.max(0, len) * 2);

    const r: { left: number; top: number; right: number; bottom: number } = { left: 0, top: 0, right: 0, bottom: 0 };
    if (api.DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, r, 16) !== 0) api.GetWindowRect(hwnd, r);

    return {
      hwnd,
      pid,
      className,
      exe: exeName(pid),
      minimized: Boolean(api.IsIconic(hwnd)),
      maximized: Boolean(api.IsZoomed(hwnd)),
      rect: { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top },
    };
  } catch (err) {
    console.error('[win32]', (err as Error).message);
    return null;
  }
}

// Remote/D-pad input adapter.
// Vega's WebView maps the remote to ArrowUp/Down/Left/Right (38/40/37/39),
// Enter (13), Back as keyCode 27 (with allowSystemKeyEvents) and media
// play/pause as 179. Desktop browsers get Escape/Backspace as Back.
// We run our own spatial navigation (and preventDefault) so focus movement
// is identical in the WebView, on Fire OS, and in a desktop browser.

export type RemoteKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'back' | 'playpause' | 'volup' | 'voldown';

export function toRemoteKey(e: KeyboardEvent): RemoteKey | null {
  switch (e.key) {
    case 'ArrowUp': return 'up';
    case 'ArrowDown': return 'down';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'Enter': case ' ': return 'select';
    case 'Escape': case 'Backspace': case 'GoBack': case 'BrowserBack': return 'back';
    case 'MediaPlayPause': case 'MediaPlay': case 'MediaPause': return 'playpause';
    case 'AudioVolumeUp': case 'VolumeUp': case 'MediaFastForward': case '+': case '=': return 'volup';
    case 'AudioVolumeDown': case 'VolumeDown': case 'MediaRewind': case '-': case '_': return 'voldown';
  }
  switch (e.keyCode) {
    case 38: return 'up';
    case 40: return 'down';
    case 37: return 'left';
    case 39: return 'right';
    case 13: return 'select';
    case 27: case 8: return 'back';
    case 179: return 'playpause';
    case 175: case 447: case 228: return 'volup';
    case 174: case 448: case 227: return 'voldown';
  }
  return null;
}

const SELECTOR = '[data-focusable]:not([disabled])';

function visible(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
}

export function focusables(root: ParentNode = document): HTMLElement[] {
  const modal = document.querySelector<HTMLElement>('[data-focus-trap]');
  return Array.from((modal ?? root).querySelectorAll<HTMLElement>(SELECTOR)).filter(visible);
}

/**
 * Pick the next focusable in a direction, "nearest row first":
 * 1. keep candidates that lie in that direction,
 * 2. find the closest row/column by edge gap (so Down never skips a row),
 * 3. within that row, pick the one most aligned with the current element.
 */
export function nextInDirection(from: HTMLElement | null, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const all = focusables();
  if (!from || !all.includes(from)) return all.find((e) => e.dataset.autofocus !== undefined) ?? all[0] ?? null;
  const a = from.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  const horiz = dir === 'left' || dir === 'right';
  const cands: { el: HTMLElement; gap: number; cross: number }[] = [];
  for (const el of all) {
    if (el === from) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const d = horiz ? bx - ax : by - ay;
    if ((dir === 'right' || dir === 'down') ? d <= 1 : d >= -1) continue;
    // Up / Down: the target must really sit in the next row (its edge past ours), not just have a lower centre.
    // (Tiles of different heights side by side used to make Down jump sideways to the neighbouring tile.)
    if (!horiz) {
      const tol = Math.min(a.height, b.height) * 0.25;
      if (dir === 'down' ? b.top < a.bottom - tol : b.bottom > a.top + tol) continue;
    }
    const gap = Math.max(0, dir === 'right' ? b.left - a.right : dir === 'left' ? a.left - b.right : dir === 'down' ? b.top - a.bottom : a.top - b.bottom);
    // For left/right, ignore things that are mostly in another row.
    if (horiz) {
      const vOverlap = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (vOverlap < Math.min(a.height, b.height) * 0.3 && Math.abs(by - ay) > a.height) continue;
    }
    cands.push({ el, gap, cross: horiz ? Math.abs(by - ay) : Math.abs(bx - ax) });
  }
  if (!cands.length) return null;
  const nearest = Math.min(...cands.map((c) => c.gap));
  const row = cands.filter((c) => c.gap <= nearest + 40);
  row.sort((p, q) => p.cross - q.cross || p.gap - q.gap);
  return row[0].el;
}

/** Remembers the last focused element per screen so returning restores focus. */
export class FocusMemory {
  private mem = new Map<string, string>();
  remember(screen: string) {
    const el = document.activeElement as HTMLElement | null;
    if (el?.dataset.fkey) this.mem.set(screen, el.dataset.fkey);
  }
  restore(screen: string) {
    const key = this.mem.get(screen);
    const all = focusables();
    const target =
      (key && all.find((e) => e.dataset.fkey === key)) ||
      all.find((e) => e.dataset.autofocus !== undefined) ||
      all[0];
    target?.focus({ preventScroll: true });
  }
  clear() { this.mem.clear(); }
}

/** Ensure something sensible is focused (after a modal closes, content changes, etc.). */
export function ensureFocus() {
  const active = document.activeElement as HTMLElement | null;
  const all = focusables();
  if (!active || !all.includes(active)) {
    (all.find((e) => e.dataset.autofocus !== undefined) ?? all[0])?.focus({ preventScroll: true });
  }
}

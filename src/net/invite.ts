import { normalizeRoomCode, type GameMode } from './protocol';

/** One-click invites: `?room=BUST-1234&mode=a|b` on the game's own URL. */

export interface Invite {
  code: string;
  mode: GameMode;
}

export function buildInviteUrl(code: string, mode: GameMode, base: Location = window.location): string {
  const url = new URL(base.pathname, base.origin);
  url.searchParams.set('room', code);
  url.searchParams.set('mode', mode.toLowerCase());
  return url.toString();
}

/** Reads an invite from a query string; null if there's no valid room code. */
export function parseInvite(search: string): Invite | null {
  const params = new URLSearchParams(search);
  const code = normalizeRoomCode(params.get('room') ?? '');
  if (!code) return null;
  return { code, mode: params.get('mode')?.toLowerCase() === 'b' ? 'B' : 'A' };
}

/** Drop the invite params so a reload or "leave" doesn't auto-join again. */
export function clearInviteFromUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('room');
  url.searchParams.delete('mode');
  history.replaceState(null, '', url.pathname + url.search + url.hash);
}

/** Clipboard write with a fallback for contexts without the async Clipboard API (e.g. plain-http LAN). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.appendChild(area);
  area.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  area.remove();
  return ok;
}


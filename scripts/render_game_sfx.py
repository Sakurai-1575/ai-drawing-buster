#!/usr/bin/env python3
"""
Render the game's own sound effects to WAV: promo_assets/se/<name>.wav (48 kHz stereo 16-bit).

    python scripts/render_game_sfx.py

The game has no SE files — src/audio/SoundManager.ts synthesizes every sound with Web Audio oscillators.
This loads the running dev build, points that same `sound` object at an OfflineAudioContext, calls the
method (exactly what the game calls) and saves the rendered buffer, so the trailer gets the real sounds.
Each file is peak-normalized to -3 dBFS; the mix sets the level.
"""
from __future__ import annotations

import asyncio
import base64
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_gameplay import BASE_URL, DevServer, ensure_playwright  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'promo_assets' / 'se'

# name: (SoundManager method, args, seconds to render)
SOUNDS = {
    'correct': ('correct', [1], 0.8),
    'correct_combo3': ('correct', [3], 0.8),
    'critical': ('critical', [1], 1.2),
    'critical_combo2': ('critical', [2], 1.2),
    'critical_max': ('critical', [7], 1.2),
    'wrong': ('wrong', [], 0.9),
    'shatter': ('comboBreak', [], 0.7),  # glass "パリン" (combo break / a life lost)
    'countdown_3': ('countdown', [3], 0.5),
    'countdown_1': ('countdown', [1], 0.5),
    'time_up': ('timeUp', [], 1.4),
    'sweep': ('sweep', [], 0.4),
    'slam': ('slam', [], 0.4),
    'go': ('go', [], 0.6),
    'game_start': ('gameStart', [], 0.6),
    'fanfare': ('fanfare', [], 2.0),
    'click': ('click', [], 0.2),
    'achievement': ('achievement', [], 1.0),
    **{f'tick_{i}': ('tick', [i / 9], 0.12) for i in range(10)},  # rising pips (stamp flurry)
}

JS_RENDER = r"""
async ({ method, args, seconds }) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/audio\/SoundManager\.ts(\?|$)/.test(n)) ?? '/src/audio/SoundManager.ts';
  const { sound } = await import(url);
  const sr = 48000;
  const off = new OfflineAudioContext(2, Math.ceil(sr * seconds), sr);
  const master = off.createGain();
  master.gain.value = 1;
  master.connect(off.destination);
  const saved = { ctx: sound.ctx, master: sound.master, muted: sound._muted };
  sound.ctx = off; sound.master = master; sound._muted = false;
  try { sound[method](...args); } finally { sound.ctx = saved.ctx; sound.master = saved.master; sound._muted = saved.muted; }
  const buf = await off.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  let peak = 1e-9;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const gain = 10 ** (-3 / 20) / peak;  // -3 dBFS peak
  const n = L.length, bytes = new DataView(new ArrayBuffer(44 + n * 4));
  const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); bytes.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
  bytes.setUint32(24, sr, true); bytes.setUint32(28, sr * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
  str(36, 'data'); bytes.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i] * gain)) * 32767, true);
    bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i] * gain)) * 32767, true);
  }
  let bin = '';
  const u8 = new Uint8Array(bytes.buffer);
  for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(bin);
}
"""


async def render() -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        page = await browser.new_page()
        await page.goto(BASE_URL, wait_until='load')
        await page.wait_for_selector('text=AIお絵描きバスター', timeout=30_000)
        for name, (method, args, seconds) in SOUNDS.items():
            b64 = await page.evaluate(JS_RENDER, {'method': method, 'args': args, 'seconds': seconds})
            (OUT_DIR / f'{name}.wav').write_bytes(base64.b64decode(b64))
        await browser.close()


def main() -> None:
    ensure_playwright()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with DevServer():
        asyncio.run(render())
    print(f'{len(SOUNDS)} sounds → {OUT_DIR}')
    print('  ' + ', '.join(SOUNDS))


if __name__ == '__main__':
    main()

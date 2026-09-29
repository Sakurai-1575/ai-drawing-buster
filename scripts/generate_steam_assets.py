#!/usr/bin/env python3
"""
Generate the Steam store + library graphics for AIお絵描きバスター into promo_assets/steam/.

    python scripts/generate_steam_assets.py [--only capsules,screenshots,gif]

capsules     The dev page's capsule renderer (src/tools/capsules.ts, also at /#capsules) drawn in a real
             browser and exported at exact pixel sizes: header / small / main / vertical capsules, page
             background, library capsule / header / hero (+ the transparent library logo the hero needs).
             Buster-kun is the game's own MascotCharacter SVG. Per Steam's rules the capsules carry only art
             and the game's name — "up to 8 players" appears as 8 player-colored buzzer lamps, not text.
screenshots  Five 1920x1080 captures of real play, driven like scripts/record_gameplay.py (the 8-player one
             has 7 bot players join over PeerJS, so it needs the internet).
gif          store_gameplay.gif: the 1.5x-speed drawing → instant answer loop, cut from the recorded
             scene4 clip via its markers (720 px wide, palette-optimized).

Finishes by opening every file and checking its pixel size against the Steam spec.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import json
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import find_ffmpeg  # noqa: E402
from record_gameplay import (  # noqa: E402
    ACH_SEEDED,
    BASE_URL,
    BOT_NAMES,
    JS_CHOICES,
    JS_PIN_QUIZZES,
    JS_RESTORE_QUIZZES,
    JS_SEED_PROGRESS,
    ANSWER_BUTTONS,
    GPU_ARGS,
    DevServer,
    bot_loop,
    click_text,
    ensure_playwright,
    new_page,
    open_title,
    press_choice,
    start_solo,
    wait_done,
    wait_live,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'promo_assets' / 'steam'
RAW = ROOT / 'promo_assets' / 'raw_video'

# Steam spec: file → (width, height)
SPEC = {
    'header_capsule.png': (920, 430),
    'small_capsule.png': (462, 174),
    'main_capsule.png': (1232, 706),
    'vertical_capsule.png': (748, 896),
    'page_background.png': (1438, 810),
    'library_capsule.png': (600, 900),
    'library_header.png': (920, 430),
    'library_hero.png': (3840, 1240),
    'library_logo.png': (1280, 720),
    'screenshot_01_godspeed.png': (1920, 1080),
    'screenshot_02_mislead.png': (1920, 1080),
    'screenshot_03_multiplayer_8p.png': (1920, 1080),
    'screenshot_04_suddendeath.png': (1920, 1080),
    'screenshot_05_dex_collection.png': (1920, 1080),
}
CAPSULE_IDS = ['header_capsule', 'small_capsule', 'main_capsule', 'vertical_capsule', 'page_background', 'library_capsule', 'library_header', 'library_hero', 'library_logo']
GIF = 'store_gameplay.gif'
GIF_WIDTH = 720

# ---------------------------------------------------------------------------------------------
# Capsules
# ---------------------------------------------------------------------------------------------

JS_CAPSULES = r"""
async (ids) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/tools\/capsules\.ts(\?|$)/.test(n));
  if (!url) throw new Error('capsules.ts is not loaded (is this a dev build at /#capsules?)');
  const m = await import(url);
  await document.fonts.ready;
  await m.loadCapsuleArt();
  const out = {};
  for (const id of ids) {
    const spec = m.CAPSULES.find((s) => s.id === id);
    const canvas = document.createElement('canvas');
    m.renderCapsule(canvas, spec);
    out[id] = canvas.toDataURL('image/png').split(',')[1];
  }
  return out;
}
"""


async def capsules(browser) -> None:
    ctx, page = await new_page(browser)
    await page.goto(f'{BASE_URL}/#capsules', wait_until='load')
    await page.wait_for_selector('text=Steam画像一括生成', timeout=30_000)
    await asyncio.sleep(1.0)
    images = await page.evaluate(JS_CAPSULES, CAPSULE_IDS)
    for cid, b64 in images.items():
        (OUT / f'{cid}.png').write_bytes(base64.b64decode(b64))
    await ctx.close()
    print(f'  capsules: {len(images)} images')


# ---------------------------------------------------------------------------------------------
# Screenshots
# ---------------------------------------------------------------------------------------------


class _NoMarks:
    def mark(self, name: str) -> None:
        pass


async def shot(page, name: str) -> None:
    await page.screenshot(path=str(OUT / name), type='png')
    print(f'  {name}')


async def screenshot_godspeed(browser) -> None:
    ctx, page = await new_page(browser)
    await open_title(page)
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': ['pizza', 'apple'], 'count': 0, 'seed': 0, 'exclude': []}))
    await start_solo(page, '1')
    await wait_live(page)
    await asyncio.sleep(0.4)  # right after the first stroke
    await press_choice(page, labels)
    await asyncio.sleep(0.42)  # GOD SPEED banner fully in, confetti flying
    await shot(page, 'screenshot_01_godspeed.png')
    await ctx.close()


async def screenshot_mislead(browser) -> None:
    ctx, page = await new_page(browser)
    await open_title(page)
    await page.evaluate(JS_PIN_QUIZZES, {'ids': ['icecream'], 'count': 0, 'seed': 0, 'exclude': []})
    await start_solo(page, '1')
    await wait_live(page)
    await asyncio.sleep(1.9)  # the cone looks like a torch…
    await press_choice(page, 'たいまつ')
    await asyncio.sleep(0.12)  # red flash, −3,000, LOCK bar, Buster-kun gloating
    await shot(page, 'screenshot_02_mislead.png')
    await ctx.close()


async def screenshot_multiplayer(browser) -> None:
    ctx, host = await new_page(browser, name='バスター使い')
    await open_title(host)
    labels = set(await host.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 3, 'seed': 8, 'exclude': ['icecream', 'apple', 'airplane', 'pizza']}))
    await click_text(host, 'マルチプレイ')
    await click_text(host, 'AI早当てバトル')
    await click_text(host, '部屋を作成')
    await host.wait_for_function("() => /BUST-\\d{4}/.test(document.body.innerText)", timeout=30_000)
    code = await host.evaluate("() => document.body.innerText.match(/BUST-\\d{4}/)[0]")
    bots = []
    for bot_name in BOT_NAMES:
        bctx, bpage = await new_page(browser, name=bot_name, size=(640, 360))
        await bpage.goto(f'{BASE_URL}/?room={code}&mode=a', wait_until='load')
        bots.append((bctx, bpage))
    await host.wait_for_function("() => !document.body.innerText.includes('募集中')", timeout=60_000)
    await host.get_by_role('button', name='3', exact=True).click()
    await asyncio.sleep(0.6)
    rng = random.Random(8)
    tasks = [asyncio.ensure_future(bot_loop(p, labels, rng, i, _NoMarks())) for i, (_, p) in enumerate(bots)]
    await host.keyboard.press('Enter')
    await wait_live(host, timeout=60_000)
    await asyncio.sleep(1.05)
    await press_choice(host, labels)
    await asyncio.sleep(0.75)  # most of the room has buzzed: ◯/✕ lamps, toasts, stamps in the air
    await shot(host, 'screenshot_03_multiplayer_8p.png')
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    for bctx, _ in bots:
        await bctx.close()
    await ctx.close()


async def screenshot_sudden_and_dex(browser) -> None:
    ctx, page = await new_page(browser)
    await open_title(page)
    await page.evaluate(JS_SEED_PROGRESS, {'share': 0.86, 'achievements': ACH_SEEDED})
    await open_title(page)
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 45, 'seed': 31, 'exclude': []}))
    await start_solo(page, '2')
    print('  (Sudden Death up to 1.5x off camera, ~70 s)')
    for _ in range(30):
        await wait_live(page)
        await asyncio.sleep(0.45)
        await press_choice(page, labels)
        await wait_done(page)
    # Q31 at 1.5x: a miss breaks a heart, then the drawing races on.
    await wait_live(page)
    await asyncio.sleep(0.5)
    choices = await page.evaluate(JS_CHOICES, ANSWER_BUTTONS)
    await press_choice(page, next(c for c in choices if c not in labels))
    await asyncio.sleep(1.25)
    await shot(page, 'screenshot_04_suddendeath.png')
    await asyncio.sleep(1.0)
    await press_choice(page, labels)
    await wait_done(page)

    await page.keyboard.press('Escape')
    await click_text(page, 'タイトルへ')
    await page.evaluate(JS_RESTORE_QUIZZES)
    await page.wait_for_selector('text=AIお絵描きバスター')
    await asyncio.sleep(0.8)
    await click_text(page, '図鑑')
    await page.wait_for_selector('[role="tab"]')
    await asyncio.sleep(1.2)
    await shot(page, 'screenshot_05_dex_collection.png')
    await ctx.close()


async def screenshots(browser) -> None:
    await screenshot_godspeed(browser)
    await screenshot_mislead(browser)
    await screenshot_multiplayer(browser)
    await screenshot_sudden_and_dex(browser)


# ---------------------------------------------------------------------------------------------
# GIF
# ---------------------------------------------------------------------------------------------


def make_gif() -> None:
    clip = RAW / 'scene4_volume_dex.mp4'
    marks_file = clip.with_suffix('.markers.json')
    if not clip.exists() or not marks_file.exists():
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'record_gameplay.py'), '--only', 'scene4'], check=True)
    m = json.loads(marks_file.read_text(encoding='utf-8'))
    a, b = m['live31'] - 0.15, m['answer31'] + 1.25  # the 1.5x drawing races in → instant answer → 正解！
    ffmpeg = find_ffmpeg()
    graph = (
        f'fps=15,scale={GIF_WIDTH}:-1:flags=lanczos,split[x][y];'
        '[x]palettegen=max_colors=128:stats_mode=diff[p];'
        '[y][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle'
    )
    subprocess.run(
        [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', str(clip),
         '-filter_complex', graph, '-loop', '0', str(OUT / GIF)],
        check=True,
    )
    print(f'  {GIF} ({b - a:.2f}s loop)')


# ---------------------------------------------------------------------------------------------


async def run_browser(parts: list[str]) -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='chromium', args=['--ignore-gpu-blocklist', '--enable-gpu-rasterization', *GPU_ARGS])
        if 'capsules' in parts:
            await capsules(browser)
        if 'screenshots' in parts:
            await screenshots(browser)
        await browser.close()


def verify() -> bool:
    ok = True
    print('\npromo_assets/steam/')
    print(f'  {"file":<36} {"size (px)":>12} {"Steam spec":>12} {"file size":>10}')
    for name, want in SPEC.items():
        path = OUT / name
        if not path.exists():
            print(f'  {name:<36} {"(missing)":>12}')
            ok = False
            continue
        with Image.open(path) as im:
            got = im.size
        good = got == want
        ok &= good
        print(f'  {name:<36} {f"{got[0]}x{got[1]}":>12} {("OK " if good else "NG ") + f"{want[0]}x{want[1]}":>12} {path.stat().st_size / 1024:>8.0f} KB')
    gif = OUT / GIF
    if gif.exists():
        with Image.open(gif) as im:
            frames, size = getattr(im, 'n_frames', 1), im.size
        print(f'  {GIF:<36} {f"{size[0]}x{size[1]}":>12} {f"{frames} frames":>12} {gif.stat().st_size / 1024:>8.0f} KB')
    else:
        print(f'  {GIF:<36} {"(missing)":>12}')
        ok = False
    print('\n' + ('全アセットが指定解像度と一致しました。' if ok else '一致しないアセットがあります（上記 NG / missing）。'))
    return ok


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated: capsules, screenshots, gif')
    args = ap.parse_args()
    parts = args.only.split(',') if args.only else ['capsules', 'screenshots', 'gif']
    OUT.mkdir(parents=True, exist_ok=True)
    browser_parts = [p for p in parts if p in ('capsules', 'screenshots')]
    if browser_parts:
        ensure_playwright()
        with DevServer():
            asyncio.run(run_browser(browser_parts))
    if 'gif' in parts:
        make_gif()
    sys.exit(0 if verify() else 1)


if __name__ == '__main__':
    main()

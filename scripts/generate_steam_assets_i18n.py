#!/usr/bin/env python3
"""
Steam store / screenshot / library graphics in three languages (ja, en, zh) → promo_assets/steam_assets/.

    python scripts/generate_steam_assets_i18n.py [--only capsules,screenshots] [--langs ja,en,zh]

    promo_assets/steam_assets/<ja|en|zh>/{store,screenshots,library}/<name>_<size>_<steamlang>.png
    (steam language suffixes: japanese / english / schinese)

capsules     The dev capsule renderer (src/tools/capsules.ts) drawn per language in a real browser — logo,
             chip and font change, the art stays. Steam's current sizes are rendered natively and the older,
             smaller ones are exact 2x downscales of them (Lanczos).
screenshots  Real play captured in each language's UI (1920x1080). Every shot comes twice: `screenshots/` has it
             with a caption (the game frame at 90% under a caption band, native pixels, no upscaling) and
             `screenshots/clean/` is the plain 1920x1080 frame.

Names: ja / zh use the game's own titles (AIお絵描きバスター / AI涂鸦大破解); the English store name is
"AI Quick Draw Buster". Finishes by re-opening every file and checking size (and alpha) against the spec.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import io
import random
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from record_gameplay import (  # noqa: E402
    ACH_SEEDED,
    ANSWER_BUTTONS,
    BASE_URL,
    GPU_ARGS,
    JS_CHOICES,
    JS_SEED_PROGRESS,
    DevServer,
    ensure_playwright,
    press_choice,
    start_solo,
    wait_done,
    wait_live,
    wait_reveal_over,
    wait_revealed,
)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'promo_assets' / 'steam_assets'


@dataclass(frozen=True)
class Lang:
    key: str  # folder + capsule renderer language
    game: str  # the game's own language code (localStorage adb.lang)
    steam: str  # Steam's language API name (file suffix)
    title: str


LANGS = {
    'ja': Lang('ja', 'ja', 'japanese', 'AIお絵描きバスター'),
    'en': Lang('en', 'en', 'english', 'AI Quick Draw Buster'),
    'zh': Lang('zh', 'zh-CN', 'schinese', 'AI涂鸦大破解'),
}

# ---------------------------------------------------------------------------------------------
# Capsules
# ---------------------------------------------------------------------------------------------

# renderer id → native size (all rendered once per language)
CAPSULE_IDS = ['header_capsule', 'small_capsule', 'main_capsule', 'vertical_capsule', 'page_background', 'library_capsule', 'library_header', 'library_hero', 'library_logo']

# (folder, file stem, renderer id, size) — sizes equal to the native render are copied, smaller ones downscaled.
CAPSULE_FILES = [
    ('store', 'capsule_header', 'header_capsule', (920, 430)),
    ('store', 'capsule_header', 'header_capsule', (460, 215)),
    ('store', 'capsule_small', 'small_capsule', (462, 174)),
    ('store', 'capsule_small', 'small_capsule', (231, 87)),
    ('store', 'capsule_main', 'main_capsule', (1232, 706)),
    ('store', 'capsule_main', 'main_capsule', (616, 353)),
    ('store', 'capsule_vertical', 'vertical_capsule', (748, 896)),
    ('store', 'capsule_vertical', 'vertical_capsule', (374, 448)),
    ('store', 'capsule_vertical', 'library_capsule', (600, 900)),  # the 600x900 art (same as the library capsule)
    ('store', 'page_background', 'page_background', (1438, 810)),
    ('library', 'library_capsule', 'library_capsule', (600, 900)),
    ('library', 'library_header', 'library_header', (920, 430)),
    ('library', 'library_hero', 'library_hero', (3840, 1240)),
    ('library', 'library_hero', 'library_hero', (1920, 620)),
    ('library', 'library_logo', 'library_logo', (1280, 720)),  # transparent PNG
]
TRANSPARENT = {'library_logo'}

JS_CAPSULES = r"""
async ({ lang, ids }) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/tools\/capsules\.ts(\?|$)/.test(n));
  if (!url) throw new Error('capsules.ts is not loaded (is this a dev build at /#capsules?)');
  const m = await import(url);
  await document.fonts.ready;
  await m.loadCapsuleArt();
  m.setCapsuleLang(lang);
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


async def new_page(browser, lang: Lang | None = None, size=(1920, 1080), name: str | None = None):
    ctx = await browser.new_context(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=1, locale='ja-JP')
    game = lang.game if lang else 'ja'
    init = f"try {{ localStorage.setItem('adb.lang', '{game}');"
    if name:
        init += f" localStorage.setItem('adb.playerName', {name!r});"
    init += ' } catch (e) {}'
    await ctx.add_init_script(init)
    return ctx, await ctx.new_page()


def save_png(img: Image.Image, path: Path, alpha: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img = img.convert('RGBA' if alpha else 'RGB')
    img.save(path, optimize=True)


async def capsules(browser, langs: list[Lang]) -> None:
    ctx, page = await new_page(browser)
    await page.goto(f'{BASE_URL}/#capsules', wait_until='load')
    await page.wait_for_selector('text=Steam画像一括生成', timeout=30_000)
    await asyncio.sleep(1.0)
    for lang in langs:
        images = await page.evaluate(JS_CAPSULES, {'lang': lang.key, 'ids': CAPSULE_IDS})
        native = {cid: Image.open(io.BytesIO(base64.b64decode(b64))) for cid, b64 in images.items()}
        count = 0
        for folder, stem, cid, size in CAPSULE_FILES:
            img = native[cid]
            if img.size != size:
                img = img.convert('RGBA').resize(size, Image.LANCZOS)
            path = OUT / lang.key / folder / f'{stem}_{size[0]}x{size[1]}_{lang.steam}.png'
            save_png(img, path, alpha=cid in TRANSPARENT)
            count += 1
        print(f'  {lang.key}: {count} capsule files')
    await ctx.close()


# ---------------------------------------------------------------------------------------------
# Screenshots
# ---------------------------------------------------------------------------------------------

GAME_TITLE = {'ja': 'AIお絵描きバスター', 'en': 'AI Quick Draw Buster', 'zh-CN': 'AI涂鸦大破解'}  # the game's own UI titles (= the store names)
HOST_NAME = {'ja': 'バスター使い', 'en': 'BusterFan', 'zh': '破解达人'}
BOT_NAMES = {
    'ja': ['ねこぱんち', 'らくがき職人', 'ミケ', 'ぴよたろう', 'Speedy', 'おえかき王', 'チーズ'],
    'en': ['NekoPunch', 'DoodlePro', 'Mike', 'Chick', 'Speedy', 'SketchKing', 'Cheese'],
    'zh': ['喵喵拳', '涂鸦高手', '小咪', '小鸡', '极速', '画王', '芝士'],
}

# (file number + name, caption key)
SHOTS = [
    ('01_godspeed', 'godspeed'),
    ('02_mislead', 'mislead'),
    ('03_modes', 'modes'),
    ('04_lobby_8p', 'lobby'),
    ('05_race_8p', 'race'),
    ('06_suddendeath', 'sudden'),
    ('07_dex_collection', 'dex'),
    ('08_achievements', 'achv'),
]
# Every caption states something the game does: 500 quizzes, 15 achievements, 3 solo modes, up to 8 players,
# Sudden Death speeding up to 1.5x. (The zh/en lines are new store copy: worth a native read-through.)
CAPTIONS = {
    'godspeed': {'ja': 'AIが描き終わる前に、最速で見抜け！', 'en': 'Beat the AI before it finishes drawing!', 'zh': '在AI画完之前，抢先猜出答案！'},
    'mislead': {'ja': '最初の線はウソ！AIの罠にご用心', 'en': "The AI's first strokes are a trap!", 'zh': 'AI最初画的线条，其实是陷阱！'},
    'modes': {'ja': '3つのソロモードで遊べる', 'en': 'Three solo modes to master', 'zh': '三种单人模式，任你挑战'},
    'lobby': {'ja': '最大8人でオンライン対戦', 'en': 'Online battles for up to 8 players', 'zh': '最多8人同时在线对战'},
    'race': {'ja': 'ミリ秒差を競う早押しバトル', 'en': 'Race to buzz in: every millisecond counts', 'zh': '毫秒之差决胜负的抢答大战'},
    'sudden': {'ja': 'サドンデス：生き残るほどAIが加速', 'en': 'Sudden Death: the longer you last, the faster it gets', 'zh': '突然死亡：坚持越久，AI画得越快'},
    'dex': {'ja': '全500問をバスター図鑑でコンプリート', 'en': 'Collect all 500 drawings in the Buster Dex', 'zh': '集齐图鉴中的全部500道题目'},
    'achv': {'ja': 'やり込める実績が15個', 'en': '15 achievements to unlock', 'zh': '15项成就等你来解锁'},
}

CAPTION_FONTS = {
    'ja': [('C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1)],
    'en': [('C:/Windows/Fonts/seguibl.ttf', 0), ('C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1)],
    'zh': [('C:/Windows/Fonts/msyhbd.ttc', 0), ('C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1)],
}
INK = (15, 23, 42, 255)


def caption_font(lang: str, size: int) -> ImageFont.FreeTypeFont:
    for path, index in CAPTION_FONTS[lang]:
        if Path(path).exists():
            return ImageFont.truetype(path, size, index=index)
    raise SystemExit(f'No caption font found for {lang}.')


# The captioned version: the 1920x1080 game frame at 88% (1690x950, no upscaling) under a caption band, on the
# game's own dot paper. Nothing of the game is covered.
BAND = 112
G_W, G_H = 1690, 950


def compose(clean: Image.Image, text: str, lang: str) -> Image.Image:
    W, H = 1920, 1080
    img = Image.new('RGB', (W, H), (254, 243, 199))
    d = ImageDraw.Draw(img)
    for y in range(21, H, 42):
        for x in range(21, W, 42):
            d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(245, 208, 140))
    gx, gy = (W - G_W) // 2, BAND + 2
    d.rounded_rectangle((gx + 12, gy + 12, gx + G_W + 12, gy + G_H + 12), radius=22, fill=INK[:3])
    game = clean.convert('RGB').resize((G_W, G_H), Image.LANCZOS)
    mask = Image.new('L', game.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, G_W - 1, G_H - 1), radius=20, fill=255)
    img.paste(game, (gx, gy), mask)
    d.rounded_rectangle((gx - 3, gy - 3, gx + G_W + 3, gy + G_H + 3), radius=24, outline=INK[:3], width=8)

    size = 72
    font = caption_font(lang, size)
    while font.getlength(text) > W - 160 and size > 36:
        size -= 2
        font = caption_font(lang, size)
    cx, cy = W // 2, BAND // 2 + 2
    layer = Image.new('RGBA', (W, BAND), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.text((cx + 5, cy + 5), text, font=font, fill=(15, 23, 42, 200), anchor='mm', stroke_width=11, stroke_fill=(15, 23, 42, 200))
    layer = layer.filter(ImageFilter.GaussianBlur(2))
    ld = ImageDraw.Draw(layer)
    ld.text((cx, cy), text, font=font, fill=(255, 255, 255, 255), anchor='mm', stroke_width=10, stroke_fill=INK)
    out = img.convert('RGBA')
    out.alpha_composite(layer, (0, 0))
    return out.convert('RGB')


JS_PIN = r"""
async ({ ids, count, seed, exclude, lang }) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/data\/quizzes\.ts(\?|$)/.test(n)) ?? '/src/data/quizzes.ts';
  const m = await import(url);
  window.__adbAllQuizzes ??= [...m.QUIZZES];
  const all = window.__adbAllQuizzes;
  const lab = (q) => q.label[lang] ?? q.label.en;
  const dec = (q) => q.misleads[lang] ?? q.misleads.en;
  let chosen;
  if (ids) {
    chosen = ids.map((id) => all.find((q) => q.id === id)).filter(Boolean);
  } else {
    // Seeded shuffle, keeping quizzes whose (localized) answers never appear as another pick's decoy.
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pool = all.filter((q) => !exclude.includes(q.id)).map((q) => [rnd(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const labels = new Set(), decoys = new Set();
    chosen = [];
    for (const q of pool) {
      const l = lab(q), d = dec(q);
      if (labels.has(l) || decoys.has(l) || d.some((x) => labels.has(x))) continue;
      chosen.push(q); labels.add(l); d.forEach((x) => decoys.add(x));
      if (chosen.length >= count) break;
    }
  }
  m.QUIZZES.splice(0, m.QUIZZES.length, ...chosen);
  return chosen.map((q) => ({ id: q.id, label: lab(q), misleads: dec(q) }));
}
"""

JS_STRINGS = r"""
async (lang) => {
  const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/i18n\/index\.ts(\?|$)/.test(n));
  const m = await import(url);
  return m.getStrings(lang);
}
"""

JS_STAMP = r"""
async ({ tray, label }) => {
  const open = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(tray));
  if (!open) return false;
  open.click();
  await new Promise((r) => setTimeout(r, 60));
  const s = document.querySelector(`button[aria-label="${label}"]`);
  if (s) s.click(); else open.click();
  return !!s;
}
"""


class Session:
    """One language's capture session: emits each shot twice (clean + captioned)."""

    def __init__(self, browser, lang: Lang) -> None:
        self.browser = browser
        self.lang = lang
        self.T: dict = {}

    async def page(self, size=(1920, 1080), name: str | None = None):
        return await new_page(self.browser, self.lang, size, name)

    async def title(self, page) -> None:
        await page.goto(BASE_URL, wait_until='load')
        await page.wait_for_selector(f'text={GAME_TITLE[self.lang.game]}', timeout=30_000)
        if not self.T:
            self.T = await page.evaluate(JS_STRINGS, self.lang.game)
        await asyncio.sleep(0.8)

    async def pin(self, page, **kw) -> list[dict]:
        return await page.evaluate(JS_PIN, {'ids': None, 'count': 0, 'seed': 0, 'exclude': [], **kw, 'lang': self.lang.game})

    async def click(self, page, text: str) -> None:
        await page.locator('button', has_text=text).first.click(force=True)

    def emit(self, shot_index: int, png: bytes) -> None:
        stem, key = SHOTS[shot_index]
        clean = Image.open(io.BytesIO(png)).convert('RGB')
        assert clean.size == (1920, 1080), clean.size
        folder = OUT / self.lang.key / 'screenshots'
        save_png(clean, folder / 'clean' / f'screenshot_{stem}_clean_{self.lang.steam}.png')
        save_png(compose(clean, CAPTIONS[key][self.lang.key], self.lang.key), folder / f'screenshot_{stem}_{self.lang.steam}.png')
        print(f'    {stem}')


async def snap(page) -> bytes:
    return await page.screenshot(type='png')


async def solo_shots(c: Session) -> None:
    # 01: an instant answer right after the first stroke -> GOD SPEED
    ctx, page = await c.page()
    await c.title(page)
    labels = {q['label'] for q in await c.pin(page, ids=['pizza', 'apple'])}
    await start_solo(page, '1')
    await wait_live(page)
    await asyncio.sleep(0.4)
    await press_choice(page, labels)
    await asyncio.sleep(0.42)
    c.emit(0, await snap(page))
    await ctx.close()

    # 02: the cone reads as a torch: fall for it (red flash, penalty, lock bar)
    ctx, page = await c.page()
    await c.title(page)
    quiz = (await c.pin(page, ids=['icecream']))[0]
    await start_solo(page, '1')
    await wait_live(page)
    await asyncio.sleep(1.9)
    await press_choice(page, quiz['misleads'][0])
    await asyncio.sleep(0.12)
    c.emit(1, await snap(page))
    await ctx.close()

    # 03 / 07 / 08: with collected progress: mode picker, Buster Dex, achievements
    ctx, page = await c.page()
    await c.title(page)
    await page.evaluate(JS_SEED_PROGRESS, {'share': 0.86, 'achievements': ACH_SEEDED})
    await c.title(page)
    await page.keyboard.press('Space')
    await page.wait_for_selector('[role="dialog"]')
    await asyncio.sleep(0.7)
    c.emit(2, await snap(page))
    await c.title(page)
    await c.click(page, c.T['dexButton'])
    await page.wait_for_selector('[role="tab"]')
    await asyncio.sleep(1.3)
    c.emit(6, await snap(page))
    await c.title(page)
    await page.locator('[data-testid="achievements-button"]').click(force=True)
    await asyncio.sleep(1.5)
    c.emit(7, await snap(page))
    await ctx.close()


async def bot_loop(page, labels: set[str], rng: random.Random, index: int, T: dict) -> None:
    """One bot: buzz with a personal reaction time (the reckless ones fall for a decoy first), sometimes stamp."""
    stamps = [T['stampClap'], T['stampLol'], T['stampOops'], T['stampHmm']]
    while True:
        await wait_live(page, timeout=120_000)
        await asyncio.sleep(0.55 + index * 0.2 + rng.uniform(0, 0.25))
        if index in (2, 5) and rng.random() < 0.7:
            wrong = [x for x in await page.evaluate(JS_CHOICES, ANSWER_BUTTONS) if x not in labels]
            if wrong:
                await press_choice(page, rng.choice(wrong))
                await asyncio.sleep(3.1)
        await press_choice(page, labels)
        if rng.random() < 0.6:
            await asyncio.sleep(rng.uniform(0.1, 0.5))
            await page.evaluate(JS_STAMP, {'tray': T['stampTray'], 'label': rng.choice(stamps)})
        await wait_revealed(page, timeout=120_000)
        await wait_reveal_over(page, timeout=120_000)
        if rng.random() < 0.5:
            await asyncio.sleep(rng.uniform(0.2, 1.2))
            await page.evaluate(JS_STAMP, {'tray': T['stampTray'], 'label': rng.choice(stamps)})


async def online_shots(c: Session) -> None:
    ctx, host = await c.page(name=HOST_NAME[c.lang.key])
    await c.title(host)
    T = c.T
    labels = {q['label'] for q in await c.pin(host, count=3, seed=8, exclude=['icecream', 'apple', 'airplane', 'pizza'])}
    await c.click(host, T['multiplayer'])
    await c.click(host, T['mpModeACard'])
    await c.click(host, T['mpCreate'])
    await host.wait_for_function("() => /BUST-\\d{4}/.test(document.body.innerText)", timeout=30_000)
    code = await host.evaluate("() => document.body.innerText.match(/BUST-\\d{4}/)[0]")
    bots = []
    for name in BOT_NAMES[c.lang.key]:
        bctx, bpage = await c.page(size=(640, 360), name=name)
        await bpage.goto(f'{BASE_URL}/?room={code}&mode=a', wait_until='load')
        bots.append((bctx, bpage))
    await host.wait_for_function('(s) => !document.body.innerText.includes(s)', arg=T['mpWaitingSlot'], timeout=60_000)
    await host.get_by_role('button', name='3', exact=True).click()
    await asyncio.sleep(1.0)
    c.emit(3, await snap(host))  # the full 8-player lobby

    rng = random.Random(8)
    tasks = [asyncio.ensure_future(bot_loop(p, labels, rng, i, T)) for i, (_, p) in enumerate(bots)]
    await host.keyboard.press('Enter')
    await wait_live(host, timeout=60_000)
    await asyncio.sleep(1.05)
    await press_choice(host, labels)
    await asyncio.sleep(0.75)  # most of the room has buzzed: lamps, feed, stamps in the air
    c.emit(4, await snap(host))
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    for bctx, _ in bots:
        await bctx.close()
    await ctx.close()


async def sudden_shot(c: Session) -> None:
    ctx, page = await c.page()
    await c.title(page)
    await page.evaluate(JS_SEED_PROGRESS, {'share': 0.86, 'achievements': ACH_SEEDED})
    await c.title(page)
    labels = {q['label'] for q in await c.pin(page, count=45, seed=31)}
    await start_solo(page, '2')
    print('    (Sudden Death up to 1.5x off camera, ~70 s)')
    for _ in range(30):
        await wait_live(page)
        await asyncio.sleep(0.45)
        await press_choice(page, labels)
        await wait_done(page)
    await wait_live(page)
    await asyncio.sleep(0.5)  # Q31 at 1.5x: a miss breaks a heart while the drawing races on
    wrong = next(x for x in await page.evaluate(JS_CHOICES, ANSWER_BUTTONS) if x not in labels)
    await press_choice(page, wrong)
    await asyncio.sleep(1.25)
    c.emit(5, await snap(page))
    await ctx.close()


async def screenshots(browser, langs: list[Lang]) -> None:
    for lang in langs:
        print(f'  {lang.key}: {lang.title}')
        c = Session(browser, lang)
        await solo_shots(c)
        await online_shots(c)
        await sudden_shot(c)


# ---------------------------------------------------------------------------------------------
# Verification
# ---------------------------------------------------------------------------------------------


def verify(langs: list[Lang]) -> bool:
    ok = True
    for lang in langs:
        print(f'\n[{lang.key}]  {lang.title}')
        for folder in ('store', 'screenshots', 'library'):
            d = OUT / lang.key / folder
            files = sorted(p for p in d.rglob('*.png')) if d.exists() else []
            print(f'  {folder}/  ({len(files)} files)')
            for p in files:
                with Image.open(p) as im:
                    size, mode = im.size, im.mode
                    expected = None
                    stem = p.stem
                    for token in stem.split('_'):
                        if 'x' in token and token.replace('x', '').isdigit():
                            w, h = token.split('x')
                            expected = (int(w), int(h))
                    if folder == 'screenshots':
                        expected = (1920, 1080)
                    alpha_ok = True
                    if 'library_logo' in stem:
                        alpha_ok = mode == 'RGBA' and im.getchannel('A').getextrema()[0] == 0  # transparent somewhere
                    elif mode == 'RGBA':
                        alpha_ok = im.getchannel('A').getextrema()[0] == 255  # fully opaque
                    good = expected == size and alpha_ok
                    ok &= good
                    rel = p.relative_to(d)
                    flag = 'OK ' if good else 'NG '
                    print(f'    {flag}{str(rel):<58} {size[0]:>4}x{size[1]:<4} {p.stat().st_size / 1024:>7.0f} KB{"" if alpha_ok else "  (alpha!)"}')
    return ok


# ---------------------------------------------------------------------------------------------


async def run_browser(parts: list[str], langs: list[Lang]) -> None:
    from playwright.async_api import async_playwright

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='chromium', args=['--ignore-gpu-blocklist', '--enable-gpu-rasterization', *GPU_ARGS])
        if 'capsules' in parts:
            await capsules(browser, langs)
        if 'screenshots' in parts:
            await screenshots(browser, langs)
        await browser.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated: capsules, screenshots')
    ap.add_argument('--langs', help='comma-separated: ja, en, zh (default all)')
    ap.add_argument('--verify-only', action='store_true', help='only re-check the files already written')
    args = ap.parse_args()
    parts = args.only.split(',') if args.only else ['capsules', 'screenshots']
    langs = [LANGS[k] for k in (args.langs.split(',') if args.langs else LANGS)]
    if not args.verify_only:
        ensure_playwright()
        with DevServer():
            asyncio.run(run_browser(parts, langs))
    sys.exit(0 if verify(langs) else 1)


if __name__ == '__main__':
    main()

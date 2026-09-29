#!/usr/bin/env python3
"""
Record the gameplay clips the vertical shorts are cut from: promo_assets/raw_video/shorts/<clip>.mp4
(+ .markers.json with the key moments and .meta.json with e.g. the answer choices).

    python scripts/record_shorts.py [--only quiz_swan,traps,...]

Clips (1920x1080 unless noted; same rig as record_gameplay.py):
  quiz_swan / quiz_tajmahal / quiz_penguin   one quiz drawing for ~5 s, then the right answer
  traps          three quizzes, each: fall for the obvious decoy first, then get it
  streak         five instant answers in a row (combo ×1.4, GOD SPEED every time) → result screen
  mp8            8-player online (host + 7 bots), two full rounds
  cta_vertical   1080x1920 end card: logo, Buster-kun, "search on Steam" card (built in the live game)
"""
from __future__ import annotations

import argparse
import asyncio
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import find_ffmpeg  # noqa: E402
from record_gameplay import (  # noqa: E402
    ANSWER_BUTTONS,
    BASE_URL,
    BOT_NAMES,
    GPU_ARGS,
    JS_CHOICES,
    JS_PIN_QUIZZES,
    DevServer,
    Recorder,
    bot_loop,
    click_text,
    ensure_playwright,
    new_page,
    open_title,
    press_choice,
    start_solo,
    wait_done,
    wait_live,
    wait_reveal_over,
    wait_revealed,
)

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'promo_assets' / 'raw_video' / 'shorts'

QUIZ_CLIPS = {'quiz_swan': 'swan', 'quiz_tajmahal': 'tajmahal', 'quiz_penguin': 'penguin'}
TRAP_IDS = ['rabbit', 'busstop', 'pufferfish']
STREAK_IDS = ['car', 'tree', 'cat', 'ufo', 'crown']

JS_QUIZ_TEXT = r"""
async (ids) => {
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/data\/quizzes\.ts(\?|$)/.test(n)) ?? '/src/data/quizzes.ts');
  const all = window.__adbAllQuizzes ?? m.QUIZZES;
  return Object.fromEntries(ids.map((id) => {
    const q = all.find((x) => x.id === id);
    return [id, { label: q.label.ja, misleads: q.misleads.ja }];
  }));
}
"""


async def choices(page) -> list[str]:
    return await page.evaluate(JS_CHOICES, ANSWER_BUTTONS)


async def quiz_clip(browser, quiz_id: str, out: Path, ffmpeg: str):
    ctx, page = await new_page(browser)
    await open_title(page)
    await page.evaluate(JS_PIN_QUIZZES, {'ids': [quiz_id], 'count': 0, 'seed': 0, 'exclude': []})
    text = (await page.evaluate(JS_QUIZ_TEXT, [quiz_id]))[quiz_id]
    rec = Recorder(page)
    await rec.start()
    await start_solo(page, '1')
    await wait_live(page)
    rec.mark('live')
    rec.meta = {'quiz': quiz_id, 'answer': text['label'], 'misleads': text['misleads'], 'choices': await choices(page)}
    await asyncio.sleep(5.2)  # let the drawing run well past the decoy stage
    await press_choice(page, text['label'])
    rec.mark('answer')
    await wait_revealed(page)
    rec.mark('revealed')
    await wait_reveal_over(page)
    rec.mark('reveal_over')
    await asyncio.sleep(0.5)
    await rec.stop()
    await ctx.close()
    return rec.write(out, ffmpeg)


async def traps_clip(browser, out: Path, ffmpeg: str):
    ctx, page = await new_page(browser)
    await open_title(page)
    await page.evaluate(JS_PIN_QUIZZES, {'ids': TRAP_IDS, 'count': 0, 'seed': 0, 'exclude': []})
    text = await page.evaluate(JS_QUIZ_TEXT, TRAP_IDS)
    rec = Recorder(page)
    rec.meta = {'rounds': []}
    await rec.start()
    await start_solo(page, '1')
    for n in range(1, len(TRAP_IDS) + 1):
        await wait_live(page)
        rec.mark(f'live{n}')
        shown = await choices(page)
        qid = next(i for i in TRAP_IDS if text[i]['label'] in shown)
        decoy = text[qid]['misleads'][0]
        rec.meta['rounds'].append({'quiz': qid, 'answer': text[qid]['label'], 'decoy': decoy, 'choices': shown})
        await asyncio.sleep(1.6)
        await press_choice(page, decoy)  # the obvious reading of the first strokes
        rec.mark(f'wrong{n}')
        await asyncio.sleep(3.15)  # lock
        await press_choice(page, text[qid]['label'])
        rec.mark(f'answer{n}')
        await wait_revealed(page)
        await wait_reveal_over(page)
        rec.mark(f'over{n}')
    await asyncio.sleep(1.2)  # result screen
    await rec.stop()
    await ctx.close()
    return rec.write(out, ffmpeg)


async def streak_clip(browser, out: Path, ffmpeg: str):
    ctx, page = await new_page(browser)
    await open_title(page)
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': STREAK_IDS, 'count': 0, 'seed': 0, 'exclude': []}))
    rec = Recorder(page)
    await rec.start()
    await start_solo(page, '1')
    for n, delay in enumerate((0.36, 0.32, 0.4, 0.3, 0.34), 1):
        await wait_live(page)
        rec.mark(f'live{n}')
        await asyncio.sleep(delay)
        await press_choice(page, labels)
        rec.mark(f'answer{n}')
        await wait_revealed(page)
        await wait_reveal_over(page)
    rec.mark('result')
    await asyncio.sleep(3.2)  # result screen: rank + NEW RECORD
    await rec.stop()
    await ctx.close()
    return rec.write(out, ffmpeg)


async def mp8_clip(browser, out: Path, ffmpeg: str):
    ctx, host = await new_page(browser, name='バスター使い')
    await open_title(host)
    labels = set(await host.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 3, 'seed': 21, 'exclude': ['icecream', 'apple', 'airplane', 'pizza']}))
    await click_text(host, 'マルチプレイ')
    await click_text(host, 'AI早当てバトル')
    await click_text(host, '部屋を作成')
    await host.wait_for_function("() => /BUST-\\d{4}/.test(document.body.innerText)", timeout=30_000)
    code = await host.evaluate("() => document.body.innerText.match(/BUST-\\d{4}/)[0]")
    print(f'    room {code}: inviting 7 bots…')
    bots = []
    for name in BOT_NAMES:
        bctx, bpage = await new_page(browser, name=name, size=(640, 360))
        await bpage.goto(f'{BASE_URL}/?room={code}&mode=a', wait_until='load')
        bots.append((bctx, bpage))
    await host.wait_for_function("() => !document.body.innerText.includes('募集中')", timeout=60_000)
    await host.get_by_role('button', name='3', exact=True).click()
    await asyncio.sleep(0.6)

    rng = random.Random(21)
    rec = Recorder(host)
    tasks = [asyncio.ensure_future(bot_loop(p, labels, rng, i, rec)) for i, (_, p) in enumerate(bots)]
    await rec.start()
    await asyncio.sleep(1.0)
    rec.mark('lobby')
    await host.keyboard.press('Enter')
    rec.mark('start')
    for r, delay in ((1, 1.0), (2, 0.85)):
        await wait_live(host, timeout=60_000)
        rec.mark(f'live{r}')
        await asyncio.sleep(delay)
        await press_choice(host, labels)
        rec.mark(f'host_answer{r}')
        await host.wait_for_function("() => document.body.innerText.includes('正解は')", timeout=60_000)
        rec.mark(f'round_end{r}')
        await host.wait_for_function(f"() => /Q\\s*{r + 1}/.test(document.body.innerText)", timeout=60_000)
        rec.mark(f'next{r}')
    await asyncio.sleep(0.8)
    await rec.stop()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    for bctx, _ in bots:
        await bctx.close()
    await ctx.close()
    return rec.write(out, ffmpeg)


JS_CTA_VERTICAL = r"""
() => {
  const mascot = document.querySelector('svg[aria-label="Buster-kun"]');
  const root = document.createElement('div');
  root.className = 'stage-bg';
  root.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;font-family:var(--font-game);color:#0f172a;overflow:hidden;padding-bottom:180px';
  const k = 2.0;
  const shadow = [1,2,3,4].map((i) => `${i*k}px ${i*k}px 0 #0f172a`).concat([5,6,7,8].map((i) => `${i*k}px ${i*k}px 0 #e11d48`), [9,10].map((i) => `${i*k}px ${i*k}px 0 #0f172a`)).join(',');
  root.innerHTML = `
    <div id="v-badge" style="transform:rotate(-4deg);border:6px solid #0f172a;border-radius:18px;background:#7dd3fc;padding:6px 22px;font-size:40px;font-weight:900;box-shadow:7px 7px 0 #0f172a">REAL-TIME SKETCH QUIZ</div>
    <h1 id="v-logo" style="margin:0;text-align:center;transform:rotate(-3deg);font-size:138px;line-height:1.05;font-weight:900;color:#fff;-webkit-text-stroke:7px #0f172a;paint-order:stroke fill;text-shadow:${shadow};white-space:nowrap">AIお絵描き<br><span style="color:#fcd34d">バスター</span></h1>
    <div id="v-mascot" style="width:470px;display:flex;justify-content:center"></div>
    <div id="v-card" style="border:7px solid #0f172a;border-radius:30px;background:#fff;box-shadow:10px 10px 0 #0f172a;padding:24px 34px;display:flex;flex-direction:column;align-items:center;gap:16px">
      <div style="font-size:50px;font-weight:900">🔍 Steamで検索！</div>
      <div style="border:6px solid #0f172a;border-radius:20px;background:#e11d48;color:#fff;font-size:52px;font-weight:900;padding:10px 30px;box-shadow:7px 7px 0 #0f172a">♥ ウィッシュリスト登録受付中</div>
    </div>
    <div style="position:absolute;bottom:40px;right:40px;font-size:24px;font-weight:700;color:#475569">VOICEVOX:猫使ビィ</div>`;
  if (mascot) {
    const clone = mascot.cloneNode(true);
    clone.setAttribute('width', '430');
    clone.removeAttribute('height');
    root.querySelector('#v-mascot').appendChild(clone);
  }
  document.body.appendChild(root);
  const pop = [{ transform: 'scale(0.2) rotate(-10deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(-3deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(-3deg)', opacity: 1 }];
  const opt = (delay) => ({ duration: 480, delay, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
  root.querySelector('#v-badge').animate(pop, opt(60));
  root.querySelector('#v-logo').animate(pop, opt(160));
  root.querySelector('#v-mascot').animate([{ transform: 'translateY(500px)', opacity: 0 }, { transform: 'translateY(-20px)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], opt(380));
  root.querySelector('#v-card').animate([{ transform: 'scale(0.3)', opacity: 0 }, { transform: 'scale(1.08)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], opt(700));
  root.querySelector('#v-card > div:last-child').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 1000, delay: 1200, iterations: Infinity, easing: 'ease-in-out' });
  return !!mascot;
}
"""


async def cta_vertical_clip(browser, out: Path, ffmpeg: str):
    ctx, page = await new_page(browser, size=(1080, 1920))
    await open_title(page)
    rec = Recorder(page, size=(1080, 1920))
    await rec.start()
    await asyncio.sleep(0.2)
    await page.evaluate(JS_CTA_VERTICAL)
    rec.mark('in')
    await asyncio.sleep(5.5)
    await rec.stop()
    await ctx.close()
    return rec.write(out, ffmpeg)


def jobs() -> dict:
    j = {name: (lambda b, o, f, qid=qid: quiz_clip(b, qid, o, f)) for name, qid in QUIZ_CLIPS.items()}
    j.update({'traps': traps_clip, 'streak': streak_clip, 'mp8': mp8_clip, 'cta_vertical': cta_vertical_clip})
    return j


async def run(names: list[str]) -> None:
    from playwright.async_api import async_playwright

    ffmpeg = find_ffmpeg()
    table = jobs()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(channel='chromium', args=['--ignore-gpu-blocklist', '--enable-gpu-rasterization', *GPU_ARGS])
        for name in names:
            print(f'● {name}')
            seconds, fps = await table[name](browser, OUT_DIR / f'{name}.mp4', ffmpeg)
            print(f'    {seconds:.2f}s, captured ≈{fps:.0f} fps')
        await browser.close()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated clip names')
    args = ap.parse_args()
    names = args.only.split(',') if args.only else list(jobs())
    ensure_playwright()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with DevServer():
        asyncio.run(run(names))


if __name__ == '__main__':
    main()

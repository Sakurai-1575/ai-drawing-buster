#!/usr/bin/env python3
"""
Record the trailer's gameplay scenes of AIお絵描きバスター, driven entirely by code.

    python scripts/record_gameplay.py [--only scene1,scene3] [--headed]

Writes promo_assets/raw_video/<scene>.mp4 (1920x1080, 60 fps CFR, H.264, no audio). The page itself
renders at 1920x1080 (the game's 1280x720 stage scales 1.5x), so nothing is upscaled:

    scene1_hook_critical.mp4   Score Attack: answer right after the first stroke → CRITICAL!!, Buster-kun panics
    scene2_rule_mislead.mp4    Ice cream: fall for the decoys twice (red flash) → time up, Buster-kun laughs
    scene3_multiplayer_8p.mp4  Host + 7 bot players online (Mode A): buzzer race, toasts, stamps, standings
    scene4_volume_dex.mp4      Sudden Death at 1.5x speed → Buster Dex tabs flipped → achievements

Everything is handled here: installs Playwright + Chromium if missing, starts the Vite dev server on
:1420 if it isn't running (and stops it afterwards), and encodes with FFmpeg.

How it records: Chrome's DevTools screencast streams a JPEG per rendered frame with a timestamp; the
frames are laid on a timeline with their real durations and resampled to a constant 60 fps (static
moments simply repeat a frame). Playwright's own recordVideo is capped around 25 fps and soft, hence this.

How scenes are made deterministic without touching the game: in dev builds the page can import the same
module instances the app uses (by the exact URL the app loaded — after HMR it carries a ?t= stamp), so the script narrows QUIZZES to chosen quizzes before a game starts
(and restores it before the Dex opens), seeds Dex/achievement progress in localStorage, and reads the
answer buttons to press the right (or deliberately wrong) key. Scene 3 needs the internet: online play
goes through the public PeerJS broker, exactly like real players.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import importlib.util
import json
import os
import random
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import find_ffmpeg  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'promo_assets' / 'raw_video'
BASE_URL = 'http://localhost:1420'
W, H, FPS = 1920, 1080, 60

ANSWER_BUTTONS = r'div.grid.h-\[96px\] > button'
GPU_ARGS = ['--use-angle=d3d11'] if os.name == 'nt' else ['--use-angle=gl']

# ---------------------------------------------------------------------------------------------
# Setup: Playwright, dev server
# ---------------------------------------------------------------------------------------------


def ensure_playwright() -> None:
    if importlib.util.find_spec('playwright') is None:
        print('Installing Playwright (pip)…')
        subprocess.run([sys.executable, '-m', 'pip', 'install', '--quiet', 'playwright'], check=True)
    # Idempotent: returns quickly when the browser is already there.
    subprocess.run([sys.executable, '-m', 'playwright', 'install', 'chromium'], check=True)


def server_up() -> bool:
    try:
        with urllib.request.urlopen(BASE_URL, timeout=2):
            return True
    except OSError:
        return False


class DevServer:
    """Starts `npm run dev` unless something already serves :1420; stops only what it started."""

    def __init__(self) -> None:
        self.proc: subprocess.Popen | None = None

    def __enter__(self) -> 'DevServer':
        if server_up():
            print(f'Using the dev server already running at {BASE_URL}')
            return self
        print('Starting Vite dev server…')
        flags = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0)
        self.proc = subprocess.Popen('npm run dev', cwd=ROOT, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
        for _ in range(60):
            time.sleep(0.5)
            if server_up():
                return self
        self.__exit__()
        sys.exit('Vite dev server did not start on :1420.')

    def __exit__(self, *exc) -> None:
        if not self.proc:
            return
        print('Stopping Vite dev server.')
        if os.name == 'nt':
            subprocess.run(['taskkill', '/PID', str(self.proc.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            self.proc.terminate()
        self.proc = None


# ---------------------------------------------------------------------------------------------
# Recorder: DevTools screencast → constant-60fps H.264
# ---------------------------------------------------------------------------------------------


@dataclass
class Segment:
    frames: list[tuple[float, bytes]] = field(default_factory=list)
    """(screencast timestamp in s, JPEG)."""
    first_wall: float = 0.0
    """Wall clock when the first frame arrived (pairs with frames[0]'s timestamp)."""
    end_wall: float = 0.0


class Recorder:
    """Captures one page. Call start()/stop() around each shot; segments are joined back to back."""

    def __init__(self, page, size: tuple[int, int] = (W, H)) -> None:
        self.page = page
        self.size = size
        self.cdp = None
        self.segments: list[Segment] = []
        self.current: Segment | None = None
        self.marks: list[tuple[str, Segment, float]] = []
        self.meta: dict = {}
        """Anything else worth keeping with the clip (e.g. the answer choices); written as <name>.meta.json."""

    def mark(self, name: str) -> None:
        """Note a moment (answer pressed, reveal, …); written next to the video as <name>.markers.json in video seconds."""
        if self.current is not None:
            self.marks.append((name, self.current, time.time()))

    async def _on_frame(self, params: dict) -> None:
        seg = self.current
        if seg is not None:
            if not seg.frames:
                seg.first_wall = time.time()
            seg.frames.append((params['metadata']['timestamp'], base64.b64decode(params['data'])))
        try:
            await self.cdp.send('Page.screencastFrameAck', {'sessionId': params['sessionId']})
        except Exception:
            pass

    async def start(self) -> None:
        if self.cdp is None:
            self.cdp = await self.page.context.new_cdp_session(self.page)
            self.cdp.on('Page.screencastFrame', lambda p: asyncio.ensure_future(self._on_frame(p)))
        self.current = Segment()
        await self.cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 95, 'maxWidth': self.size[0], 'maxHeight': self.size[1], 'everyNthFrame': 1})

    async def stop(self) -> None:
        seg = self.current
        seg.end_wall = time.time()
        await self.cdp.send('Page.stopScreencast')
        self.current = None
        if seg.frames:
            self.segments.append(seg)

    def write(self, out: Path, ffmpeg: str) -> tuple[float, float]:
        """Encode to `out` (+ markers JSON). Returns (duration s, captured frames per second)."""
        # Segment starts on the joined timeline, then each mark relative to its segment's first frame.
        starts, t = {}, 0.0
        for seg in self.segments:
            starts[id(seg)] = t
            t += seg.end_wall - seg.first_wall
        markers = {
            name: round(starts[id(seg)] + max(0.0, wall - seg.first_wall), 3) for name, seg, wall in self.marks if id(seg) in starts
        }
        out.with_suffix('.markers.json').write_text(json.dumps(markers, ensure_ascii=False, indent=2), encoding='utf-8')
        if self.meta:
            out.with_suffix('.meta.json').write_text(json.dumps(self.meta, ensure_ascii=False, indent=2), encoding='utf-8')
        with tempfile.TemporaryDirectory(prefix='adb_rec_') as tmp:
            lines: list[str] = []
            n = 0
            total = 0.0
            for seg in self.segments:
                t0 = seg.frames[0][0]
                end = t0 + (seg.end_wall - seg.first_wall)
                for i, (ts, jpg) in enumerate(seg.frames):
                    nxt = seg.frames[i + 1][0] if i + 1 < len(seg.frames) else end
                    dur = max(0.001, nxt - ts)
                    name = f'f{n:06d}.jpg'
                    (Path(tmp) / name).write_bytes(jpg)
                    lines += [f"file '{name}'", f'duration {dur:.6f}']
                    n += 1
                    total += dur
            lines.append(lines[-2])  # concat demuxer: the last file must be listed twice to keep its duration
            (Path(tmp) / 'frames.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
            cmd = [
                ffmpeg, '-hide_banner', '-loglevel', 'error', '-y',
                '-f', 'concat', '-safe', '0', '-i', 'frames.txt',
                '-vf', f'scale={self.size[0]}:{self.size[1]}:flags=lanczos,fps={FPS},format=yuv420p',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-r', str(FPS),
                '-t', f'{total:.3f}',  # the repeated last entry would otherwise add a frozen tail
                '-movflags', '+faststart', str(out),
            ]
            subprocess.run(cmd, check=True, cwd=tmp)
        return total, n / total if total else 0.0


# ---------------------------------------------------------------------------------------------
# Page helpers
# ---------------------------------------------------------------------------------------------

JS_PIN_QUIZZES = r"""
async ({ ids, count, seed, exclude }) => {
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/data\/quizzes\.ts(\?|$)/.test(n)) ?? '/src/data/quizzes.ts');
  window.__adbAllQuizzes ??= [...m.QUIZZES];
  const all = window.__adbAllQuizzes;
  let chosen;
  if (ids) {
    chosen = ids.map((id) => all.find((q) => q.id === id)).filter(Boolean);
  } else {
    // Seeded shuffle, then keep quizzes whose answers never appear as another pick's decoy (and vice
    // versa), so the answer button can be found from the label alone.
    let s = seed >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pool = all.filter((q) => !exclude.includes(q.id)).map((q) => [rnd(), q]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const labels = new Set(), decoys = new Set();
    chosen = [];
    for (const q of pool) {
      const l = q.label.ja, d = q.misleads.ja;
      if (labels.has(l) || decoys.has(l) || d.some((x) => labels.has(x))) continue;
      chosen.push(q); labels.add(l); d.forEach((x) => decoys.add(x));
      if (chosen.length >= count) break;
    }
  }
  m.QUIZZES.splice(0, m.QUIZZES.length, ...chosen);
  return chosen.map((q) => q.label.ja);
}
"""

JS_RESTORE_QUIZZES = r"""
async () => {
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/data\/quizzes\.ts(\?|$)/.test(n)) ?? '/src/data/quizzes.ts');
  if (window.__adbAllQuizzes) m.QUIZZES.splice(0, m.QUIZZES.length, ...window.__adbAllQuizzes);
  return m.QUIZZES.length;
}
"""

JS_CHOICES = r"""
(sel) => [...document.querySelectorAll(sel)].map((b) => b.querySelector('span.min-w-0')?.textContent.trim() ?? '')
"""

JS_BUTTONS_LIVE = r"""
(sel) => {
  const b = [...document.querySelectorAll(sel)];
  const intro = document.querySelector('.animate-intro-ready, .animate-intro-go');
  return !intro && b.length === 4 && b.every((x) => !x.disabled);
}
"""

# The reveal marks the answer button with ◯. (All four buttons are also disabled during a wrong-answer
# lock, so "all disabled" alone would fire too early.)
JS_BUTTONS_DONE = r"""
(sel) => [...document.querySelectorAll(sel)].some((b) => b.textContent.includes('◯'))
"""


async def wait_live(page, timeout: float = 30_000) -> None:
    """Until the drawing is on and every answer button accepts input (after READY… GO!)."""
    await page.wait_for_function(JS_BUTTONS_LIVE, arg=ANSWER_BUTTONS, polling='raf', timeout=timeout)


async def wait_revealed(page, timeout: float = 30_000) -> None:
    await wait_done(page, timeout)


async def wait_reveal_over(page, timeout: float = 30_000) -> None:
    """Until the reveal has finished playing out (the ◯ is gone: next question, result screen, …)."""
    await page.wait_for_function(
        "(sel) => ![...document.querySelectorAll(sel)].some((b) => b.textContent.includes('◯'))", arg=ANSWER_BUTTONS, polling='raf', timeout=timeout
    )


async def wait_done(page, timeout: float = 30_000) -> None:
    """Until the round is decided (for this player): the answer is revealed with ◯."""
    await page.wait_for_function(JS_BUTTONS_DONE, arg=ANSWER_BUTTONS, polling='raf', timeout=timeout)


async def press_choice(page, labels: set[str] | str) -> str:
    """Press the key of the button showing one of `labels`. Returns the label pressed."""
    wanted = {labels} if isinstance(labels, str) else labels
    choices = await page.evaluate(JS_CHOICES, ANSWER_BUTTONS)
    for i, text in enumerate(choices):
        if text in wanted:
            await page.keyboard.press(str(i + 1))
            return text
    raise RuntimeError(f'none of {wanted} among {choices}')


async def new_page(browser, *, name: str | None = None, size: tuple[int, int] = (W, H)):
    ctx = await browser.new_context(viewport={'width': size[0], 'height': size[1]}, device_scale_factor=1, locale='ja-JP')
    init = "try { localStorage.setItem('adb.lang', 'ja');"
    if name:
        init += f" localStorage.setItem('adb.playerName', {name!r});"
    init += ' } catch (e) {}'
    await ctx.add_init_script(init)
    page = await ctx.new_page()
    return ctx, page


async def open_title(page, url: str = BASE_URL) -> None:
    await page.goto(url, wait_until='load')
    await page.wait_for_selector('text=AIお絵描きバスター', timeout=30_000)
    await asyncio.sleep(0.8)  # fonts + first BGM frame settle


async def start_solo(page, mode_key: str) -> None:
    """Title → mode picker (Space) → mode (1 score / 2 sudden / 3 time attack)."""
    await page.keyboard.press('Space')
    await page.wait_for_selector('[role="dialog"]')
    await asyncio.sleep(0.25)
    await page.keyboard.press(mode_key)


async def click_text(page, text: str) -> None:
    # force: several buttons idle-animate (breathing start button) and never count as "stable".
    await page.locator('button', has_text=text).first.click(force=True)


# ---------------------------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------------------------


async def scene1(browser, rec_out: Path, ffmpeg: str):
    """Score Attack: title → answer right after the first stroke → CRITICAL!! → again for a combo. Effects run out."""
    ctx, page = await new_page(browser)
    await open_title(page)
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': ['apple', 'airplane', 'pizza'], 'count': 0, 'seed': 0, 'exclude': []}))
    rec = Recorder(page)
    await rec.start()
    await asyncio.sleep(2.8)  # lead-in on the title (room for the first half of the hook line)
    rec.mark('start')
    await start_solo(page, '1')
    for n, delay in enumerate((0.38, 0.45), 1):  # right after the first stroke lands
        await wait_live(page)
        rec.mark(f'live{n}')
        await asyncio.sleep(delay)
        await press_choice(page, labels)
        rec.mark(f'answer{n}')
        await wait_revealed(page)
        await wait_reveal_over(page)  # CRITICAL banner, confetti, Buster-kun's reaction all play out
        rec.mark(f'reveal_over{n}')
    await asyncio.sleep(1.2)  # tail: the next drawing begins
    await rec.stop()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


async def scene2(browser, rec_out: Path, ffmpeg: str):
    """Ice cream: the cone reads as a torch → wrong, wrong again → time up, the answer is revealed, Buster-kun laughs."""
    ctx, page = await new_page(browser)
    await open_title(page)
    await page.evaluate(JS_PIN_QUIZZES, {'ids': ['icecream'], 'count': 0, 'seed': 0, 'exclude': []})
    rec = Recorder(page)
    await rec.start()
    await asyncio.sleep(0.8)  # lead-in on the title
    await start_solo(page, '1')
    await wait_live(page)
    rec.mark('live')
    live = time.time()
    await asyncio.sleep(1.7)  # the cone is on screen, nothing else yet
    await press_choice(page, 'たいまつ')  # red flash, "ブッブー！引っかかった〜！", 3 s lock
    rec.mark('wrong1')
    await asyncio.sleep(5.2 - (time.time() - live))
    await press_choice(page, 'マイク')  # second miss (−4,000)
    rec.mark('wrong2')
    await wait_revealed(page, timeout=20_000)  # time up: the drawing completes, ◯ on アイスクリーム, Buster-kun laughs
    rec.mark('timeup')
    await wait_reveal_over(page)  # one question only: the result screen follows
    rec.mark('result')
    await asyncio.sleep(1.5)  # tail on the result screen
    await rec.stop()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


async def scene2b(browser, rec_out: Path, ffmpeg: str):
    """The solo mode picker (each card highlighted) → Sudden Death: a miss breaks a heart, then a save."""
    ctx, page = await new_page(browser)
    await open_title(page)
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 6, 'seed': 77, 'exclude': ['icecream', 'apple', 'airplane', 'pizza']}))
    rec = Recorder(page)
    await rec.start()
    await asyncio.sleep(0.6)
    await page.keyboard.press('Space')
    await page.wait_for_selector('[role="dialog"]')
    rec.mark('picker')
    await asyncio.sleep(0.7)
    for name in ('スコアアタック', 'サドンデス', 'タイムアタック', 'サドンデス'):  # sweep over the three modes
        await page.locator('[role="dialog"] button', has_text=name).first.hover(force=True)
        rec.mark(f'hover_{name}')
        await asyncio.sleep(0.75)
    await page.keyboard.press('2')
    rec.mark('pick')
    await wait_live(page)
    rec.mark('live')
    await asyncio.sleep(1.3)
    choices = await page.evaluate(JS_CHOICES, ANSWER_BUTTONS)
    await press_choice(page, next(c for c in choices if c not in labels))  # a heart breaks
    rec.mark('wrong')
    await asyncio.sleep(2.4)  # 2 s lock, the drawing keeps going
    await press_choice(page, labels)
    rec.mark('answer')
    await wait_revealed(page)
    await wait_reveal_over(page)
    rec.mark('reveal_over')
    await asyncio.sleep(1.0)
    await rec.stop()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


BOT_NAMES = ['ねこぱんち', 'らくがき職人', 'ミケ', 'ぴよたろう', 'Speedy', 'おえかき王', 'チーズ']
STAMPS = ['グッジョブ！', '草', 'やらかした', 'むずい…']

JS_SEND_STAMP = r"""
async (label) => {
  const open = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('スタンプ'));
  if (!open) return false;
  open.click();
  await new Promise((r) => setTimeout(r, 60));
  const s = document.querySelector(`button[aria-label="${label}"]`);
  if (s) s.click(); else open.click();
  return !!s;
}
"""


async def bot_loop(page, labels: set[str], rng: random.Random, index: int, rec: 'Recorder') -> None:
    """One bot: race for each drawing with a personal reaction time; sometimes miss, sometimes stamp.
    Its buzzes and stamps are marked on the host's recording (bot<i>_<kind>_<n>) for sound design."""
    n = 0
    while True:
        await wait_live(page, timeout=120_000)
        await asyncio.sleep(0.55 + index * 0.2 + rng.uniform(0, 0.25))
        if index in (2, 5) and rng.random() < 0.7:  # the reckless ones buzz a decoy first
            choices = await page.evaluate(JS_CHOICES, ANSWER_BUTTONS)
            wrong = [c for c in choices if c not in labels]
            if wrong:
                await press_choice(page, rng.choice(wrong))
                rec.mark(f'bot{index}_wrong_{n}')
                await asyncio.sleep(3.1)  # online lock
        await press_choice(page, labels)
        rec.mark(f'bot{index}_correct_{n}')
        if rng.random() < 0.6:
            await asyncio.sleep(rng.uniform(0.1, 0.5))
            await page.evaluate(JS_SEND_STAMP, rng.choice(STAMPS))
            rec.mark(f'bot{index}_stamp_{n}a')
        await wait_revealed(page, timeout=120_000)
        await wait_reveal_over(page, timeout=120_000)
        if rng.random() < 0.5:  # reactions to the standings
            await asyncio.sleep(rng.uniform(0.2, 1.2))
            await page.evaluate(JS_SEND_STAMP, rng.choice(STAMPS))
            rec.mark(f'bot{index}_stamp_{n}b')
        n += 1


async def scene3(browser, rec_out: Path, ffmpeg: str):
    """Online Mode A with 8 players: the host (recorded) + 7 bots. One whole round, lobby to next question."""
    ctx, host = await new_page(browser, name='バスター使い')
    await open_title(host)
    labels = set(await host.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 3, 'seed': 8, 'exclude': ['icecream', 'apple', 'airplane', 'pizza']}))
    await click_text(host, 'マルチプレイ')
    await click_text(host, 'AI早当てバトル')
    await click_text(host, '部屋を作成')
    await host.wait_for_function("() => /BUST-\\d{4}/.test(document.body.innerText)", timeout=30_000)
    code = await host.evaluate("() => document.body.innerText.match(/BUST-\\d{4}/)[0]")
    print(f'    room {code}: inviting 7 bots…')

    bots = []
    for name in BOT_NAMES:  # small viewports keep 7 extra renderers cheap
        bctx, bpage = await new_page(browser, name=name, size=(640, 360))
        await bpage.goto(f'{BASE_URL}/?room={code}&mode=a', wait_until='load')
        bots.append((bctx, bpage))
    await host.wait_for_function("() => !document.body.innerText.includes('募集中')", timeout=60_000)
    await host.get_by_role('button', name='3', exact=True).click()
    await asyncio.sleep(0.6)

    rng = random.Random(8)
    rec = Recorder(host)
    tasks = [asyncio.ensure_future(bot_loop(p, labels, rng, i, rec)) for i, (_, p) in enumerate(bots)]
    await rec.start()
    await asyncio.sleep(1.5)  # the full 8-player lobby
    await host.keyboard.press('Enter')  # the lobby's start shortcut
    rec.mark('start')
    await wait_live(host, timeout=60_000)  # after the READY countdown
    rec.mark('live')
    await asyncio.sleep(1.05)  # the host plays too
    await press_choice(host, labels)
    rec.mark('host_answer')
    # The whole round: buzzers, toasts, stamps, the answer reveal and the standings, until question 2 is up.
    await host.wait_for_function("() => document.body.innerText.includes('正解は')", timeout=60_000)
    rec.mark('round_end')
    await host.wait_for_function(r"() => /Q\s*2/.test(document.body.innerText)", timeout=60_000)
    rec.mark('q2')
    await asyncio.sleep(2.0)  # tail: question 2's countdown
    await rec.stop()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    for bctx, _ in bots:
        await bctx.close()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


ACH_SEEDED = ['FIRST_STEP', 'PERFECT_RUN', 'SPEED_DEMON', 'COMBO_MASTER', 'FELL_FOR_IT', 'SURVIVOR_10', 'RAPID_FIRE', 'GENRE_ALL', 'DEX_ROOKIE', 'DEX_EXPERT', 'BUSTER_FAN']

JS_SEED_PROGRESS = r"""
async ({ share, achievements }) => {
  const m = await import(performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\/src\/data\/quizzes\.ts(\?|$)/.test(n)) ?? '/src/data/quizzes.ts');
  let s = 20260928;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const ids = m.QUIZZES.map((q) => q.id).filter(() => rnd() < share);
  const now = Date.now();
  const stats = Object.fromEntries(ids.map((id) => [id, {
    firstCorrectAt: now - Math.round(rnd() * 20 * 864e5),
    bestTimeMs: 700 + Math.round(rnd() * 6500),
    correctCount: 1 + Math.floor(rnd() * 12),
  }]));
  localStorage.setItem('buster_dex_progress', JSON.stringify({ version: 1, discovered: ids, stats }));
  localStorage.setItem('adb.achievements', JSON.stringify({
    version: 1,
    unlocked: Object.fromEntries(achievements.map((id, i) => [id, now - i * 36e5])),
    counters: { decoyPicks: 14, busterClicks: 12 },
  }));
  localStorage.setItem('adb.best.sudden', '42');
  return ids.length;
}
"""


async def scene4(browser, rec_out: Path, ffmpeg: str):
    """Sudden Death reaching 1.5x → Buster Dex (every tab, scrolling) → achievements. Two shots joined."""
    ctx, page = await new_page(browser)
    await open_title(page)
    found = await page.evaluate(JS_SEED_PROGRESS, {'share': 0.86, 'achievements': ACH_SEEDED})
    print(f'    seeded Dex {found}/500 and {len(ACH_SEEDED)} achievements')
    await open_title(page)  # reload so every screen reads the seeded progress
    labels = set(await page.evaluate(JS_PIN_QUIZZES, {'ids': None, 'count': 45, 'seed': 31, 'exclude': []}))
    await start_solo(page, '2')

    print('    playing Sudden Death up to Q30 off camera (~70 s)…')
    for _ in range(29):
        await wait_live(page)
        await asyncio.sleep(0.45)
        await press_choice(page, labels)
        await wait_done(page)

    rec = Recorder(page)
    await wait_live(page)
    await rec.start()  # Q30 at 1.3x → the SPEED badge flips to 1.5x → Q31 draws fast
    for q, draw_for in ((30, 0.5), (31, 2.0)):
        await wait_live(page)
        rec.mark(f'live{q}')
        await asyncio.sleep(draw_for)
        await press_choice(page, labels)
        rec.mark(f'answer{q}')
        await wait_revealed(page)
        await wait_reveal_over(page)
        rec.mark(f'reveal_over{q}')
    await asyncio.sleep(0.6)
    await rec.stop()

    # Off camera: back to the title with the full quiz list (the Dex lists QUIZZES).
    await page.keyboard.press('Escape')
    await click_text(page, 'タイトルへ')
    await page.evaluate(JS_RESTORE_QUIZZES)
    await page.wait_for_selector('text=AIお絵描きバスター')
    await asyncio.sleep(0.8)

    await rec.start()
    await asyncio.sleep(0.5)
    await click_text(page, '図鑑')
    rec.mark('dex_open')
    await page.wait_for_selector('[role="tab"]')
    await asyncio.sleep(1.0)
    tabs = page.locator('[role="tab"]')
    rec.mark('dex_tabs')
    for i in list(range(1, await tabs.count())) + [0]:
        await tabs.nth(i).click(force=True)
        rec.mark(f'tab{i}')
        await asyncio.sleep(0.5)
    await page.mouse.move(W / 2, H * 0.62)
    rec.mark('dex_scroll')
    for _ in range(4):  # scroll through the entries
        await page.mouse.wheel(0, 380)
        await asyncio.sleep(0.35)
    await asyncio.sleep(0.6)
    await page.keyboard.press('Escape')
    await asyncio.sleep(0.5)
    await page.locator('[data-testid="achievements-button"]').click(force=True)
    rec.mark('ach_open')
    await asyncio.sleep(1.4)
    await page.mouse.move(W / 2, H * 0.55)
    for _ in range(3):
        await page.mouse.wheel(0, 300)
        await asyncio.sleep(0.4)
    await asyncio.sleep(1.2)
    await rec.stop()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


# The end card is built inside the running game so it shares the real logo style, fonts and Buster-kun
# (the title screen's SVG is cloned and enlarged). No store logos are used, only text.
JS_CTA = r"""
({ credit }) => {
  const mascot = document.querySelector('svg[aria-label="Buster-kun"]');
  const root = document.createElement('div');
  root.id = 'adb-cta';
  root.className = 'stage-bg';
  root.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;gap:90px;font-family:var(--font-game);color:#0f172a;overflow:hidden';
  const k = 2.2;  // logo extrusion scaled to the bigger type
  const shadow = [1,2,3,4].map((i) => `${i*k}px ${i*k}px 0 #0f172a`).concat([5,6,7,8].map((i) => `${i*k}px ${i*k}px 0 #e11d48`), [9,10].map((i) => `${i*k}px ${i*k}px 0 #0f172a`)).join(',');
  root.innerHTML = `
    <div id="cta-left" style="display:flex;flex-direction:column;align-items:flex-start;gap:34px">
      <div id="cta-badge" style="transform:rotate(-4deg);border:6px solid #0f172a;border-radius:18px;background:#7dd3fc;padding:6px 22px;font-size:40px;font-weight:900;box-shadow:7px 7px 0 #0f172a">REAL-TIME SKETCH QUIZ</div>
      <h1 id="cta-logo" style="margin:0;transform:rotate(-3deg);font-size:150px;line-height:1.05;font-weight:900;color:#fff;-webkit-text-stroke:7px #0f172a;paint-order:stroke fill;text-shadow:${shadow};white-space:nowrap">AIお絵描き<br>バスター</h1>
      <div id="cta-card" style="margin-top:18px;border:7px solid #0f172a;border-radius:28px;background:#fff;box-shadow:10px 10px 0 #0f172a;padding:26px 40px;display:flex;flex-direction:column;gap:14px">
        <div style="font-size:54px;font-weight:900">🎮 Steamにて近日登場！</div>
        <div style="align-self:flex-start;border:6px solid #0f172a;border-radius:20px;background:#e11d48;color:#fff;font-size:52px;font-weight:900;padding:10px 30px;box-shadow:7px 7px 0 #0f172a">♥ ウィッシュリスト登録受付中</div>
      </div>
    </div>
    <div id="cta-mascot" style="width:600px;display:flex;justify-content:center"></div>
    <div id="cta-credit" style="position:absolute;bottom:26px;right:40px;font-size:24px;font-weight:700;color:#475569">${credit}</div>`;
  if (mascot) {
    const clone = mascot.cloneNode(true);
    clone.setAttribute('width', '560');
    clone.removeAttribute('height');
    root.querySelector('#cta-mascot').appendChild(clone);
  }
  document.body.appendChild(root);
  const pop = [{ transform: 'scale(0.2) rotate(-10deg)', opacity: 0 }, { transform: 'scale(1.12) rotate(-3deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(-3deg)', opacity: 1 }];
  const opt = (delay) => ({ duration: 520, delay, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
  root.querySelector('#cta-badge').animate(pop, opt(100));
  root.querySelector('#cta-logo').animate(pop, opt(250));
  root.querySelector('#cta-mascot').animate([{ transform: 'translateY(420px)', opacity: 0 }, { transform: 'translateY(-20px)', opacity: 1, offset: 0.7 }, { transform: 'none', opacity: 1 }], opt(550));
  root.querySelector('#cta-card').animate([{ transform: 'translateX(-900px)' }, { transform: 'translateX(20px)', offset: 0.75 }, { transform: 'none' }], opt(1000));
  root.querySelector('#cta-card > div:last-child').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.07)' }, { transform: 'scale(1)' }], { duration: 1200, delay: 1600, iterations: Infinity, easing: 'ease-in-out' });
  root.querySelector('#cta-credit').animate([{ opacity: 0 }, { opacity: 1 }], opt(1400));
  return !!mascot;
}
"""

CTA_CREDIT = 'VOICEVOX:猫使ビィ ／ BGM: Jailbreak - G-MIYA（DOVA-SYNDROME）'


async def scene5_cta(browser, rec_out: Path, ffmpeg: str):
    """End card: logo, Buster-kun, 'coming to Steam / wishlist' card and credits, animating in. ~9 s."""
    ctx, page = await new_page(browser)
    await open_title(page)
    rec = Recorder(page)
    await rec.start()
    await asyncio.sleep(0.2)
    has_mascot = await page.evaluate(JS_CTA, {'credit': CTA_CREDIT})  # animations start now
    rec.mark('in')
    if not has_mascot:
        print('    (Buster-kun SVG not found on the title screen; end card without him)')
    await asyncio.sleep(9.0)
    await rec.stop()
    await ctx.close()
    return rec.write(rec_out, ffmpeg)


SCENES = {
    'scene1': ('scene1_hook_critical.mp4', scene1),
    'scene2': ('scene2_rule_mislead.mp4', scene2),
    'scene2b': ('scene2b_modes.mp4', scene2b),
    'scene3': ('scene3_multiplayer_8p.mp4', scene3),
    'scene4': ('scene4_volume_dex.mp4', scene4),
    'scene5': ('scene5_cta.mp4', scene5_cta),
}

# ---------------------------------------------------------------------------------------------


async def run(names: list[str], headed: bool) -> list[tuple[Path, float, float]]:
    from playwright.async_api import async_playwright

    ffmpeg = find_ffmpeg()
    results = []
    async with async_playwright() as pw:
        # channel='chromium' = the full browser in new-headless mode (the default headless shell has no GPU);
        # with the GPU flags it rasterizes 1080p on the graphics card instead of in software.
        browser = await pw.chromium.launch(
            headless=not headed,
            channel=None if headed else 'chromium',
            args=['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-zero-copy', *GPU_ARGS],
        )
        for key in names:
            file, fn = SCENES[key]
            out = OUT_DIR / file
            print(f'● {key} → {file}')
            seconds, fps = await fn(browser, out, ffmpeg)
            results.append((out, seconds, fps))
        await browser.close()
    return results


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated scenes to record (scene1..scene4)')
    ap.add_argument('--headed', action='store_true', help='show the browser while recording')
    args = ap.parse_args()
    names = args.only.split(',') if args.only else list(SCENES)
    unknown = [n for n in names if n not in SCENES]
    if unknown:
        sys.exit(f'unknown scene(s): {unknown}')

    ensure_playwright()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with DevServer():
        results = asyncio.run(run(names, args.headed))

    ffprobe = str(Path(find_ffmpeg()).with_name('ffprobe' + Path(find_ffmpeg()).suffix))
    print('\n録画ファイル一覧:')
    for out, seconds, fps in results:
        probed = subprocess.run(
            [ffprobe, '-v', 'error', '-show_entries', 'format=duration:stream=r_frame_rate,width,height', '-of', 'csv=p=0', str(out)],
            capture_output=True, text=True,
        ).stdout.split()
        print(f'  {seconds:5.2f}s  {out}   [{", ".join(probed)}]  captured ≈{fps:.0f} fps')


if __name__ == '__main__':
    main()

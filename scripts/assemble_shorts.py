#!/usr/bin/env python3
"""
Assemble six vertical shorts (1080x1920, 60 fps, Japanese) for TikTok / YouTube Shorts / X into
promo_assets/shorts/.

    python scripts/assemble_shorts.py [--only short_quiz_01,...] [--no-refresh] [--preview]

  short_quiz_01..03      Pause-and-guess quizzes: hook → the AI draws → FREEZE with a 5-second thinking
                         countdown ("comment your number!") → the drawing resumes → the answer lands on the
                         voice → a moment to enjoy it + like-bait line → CTA.
  short_recommend_01     Speed streak: five instant answers in a row, each stamped with its time.
  short_recommend_02     Trap challenge: three quizzes where the obvious reading is a trap.
  short_recommend_03     8-player chaos: two rounds of the online buzzer race.

Layout (the drawing first): the game footage is split into parts and re-laid out for portrait — the
canvas big in the middle, Buster-kun as a small "reaction cam", slim answer choices under the canvas.
Everything stays inside x 40–960 (a 120 px margin for the platforms' like/comment icons on the right) and
above y 1640 (the bottom ~280 px is the platforms' caption area). --preview also writes a layout sheet.

Sources are created when missing: Buster-kun's lines (official voice preset → promo_assets/voice_shorts/),
the game's SE (render_game_sfx.py) and the clips (record_shorts.py).
"""
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import Line, find_ffmpeg, render_lines  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROMO = ROOT / 'promo_assets'
CLIPS = PROMO / 'raw_video' / 'shorts'
VOICE = PROMO / 'voice_shorts'
SE = PROMO / 'se'
OUT = PROMO / 'shorts'
BGM_DIR = ROOT / 'public' / 'audio' / 'bgm'
W, H, FPS = 1080, 1920, 60

FONT_FILE, FONT_INDEX = 'C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1
INK = (15, 23, 42, 255)
WHITE = (255, 255, 255, 255)
YELLOW = (252, 211, 77, 255)
ROSE = (251, 113, 133, 255)
BUTTON_BG = [(253, 164, 175, 255), (125, 211, 252, 255), (253, 230, 138, 255), (110, 231, 183, 255)]  # the game's 4 answer colors
NUMS = ['①', '②', '③', '④']

# Safe content box: top 190 px for the platforms' search icon / tabs, right 120 px for their like/comment
# icons, bottom 280 px for their captions.
SAFE_T, SAFE_L, SAFE_R, SAFE_B = 190, 40, 960, 1640
CX = (SAFE_L + SAFE_R) // 2  # horizontal center of the safe box
HOOK_Y = SAFE_T
PHRASE_Y = 440


@dataclass(frozen=True)
class Region:
    """A crop of the 1920x1080 game footage and where it goes on the 1080x1920 frame."""

    crop: tuple[int, int, int, int]  # x, y, w, h in the source
    x: int
    y: int
    w: int
    framed: bool = False  # comic border (for insets that overlap other parts)

    @property
    def h(self) -> int:
        return round(self.w * self.crop[3] / self.crop[2] / 2) * 2


# Solo: canvas big and centered in the safe box. Buster-kun's reaction cam (his body only — the in-game
# speech bubble is cropped away, it's unreadable on a phone) overlaps the canvas's lower-left frame corner:
# only the card's margin and border (≈110×80 px), never the drawing area. The answer choices take the rest
# of the width under the canvas.
SOLO_CANVAS = Region((612, 178, 700, 710), 150, 556, 800)  # crop ends above the answer button ring (y≈892 in the source)
# Layers, back to front: canvas → answer choices (full width, centered under the canvas) → Buster-kun, pinned
# over the canvas's lower-left frame corner. He sits just above the choices' row, so they never fight for space.
OPTIONS_Y = SOLO_CANVAS.y + SOLO_CANVAS.h + 20  # top of the choices image (its first 16 px hold the ◎/✕ badges)
OPTIONS_X, OPTIONS_W = 60, 900  # right edge incl. badges/shadow ≈ 986: ≥ 90 px margin for the platforms' icons
CAM_W = 280
CAM_H = round(CAM_W * 400 / 370 / 2) * 2
SOLO_CAM = Region((180, 410, 370, 400), 6, SOLO_CANVAS.y + SOLO_CANVAS.h + 8 - CAM_H, CAM_W, framed=True)
SOLO_LAYOUT = [SOLO_CANVAS, SOLO_CAM]

# Online: scoreboard (left) + canvas (right), the player feed under the canvas, Buster-kun + stamps under the board.
MP_CANVAS = Region((612, 178, 700, 700), 350, 556, 600)
MP_BOARD = Region((180, 180, 410, 600), 40, 576, 292)
MP_FEED = Region((1335, 170, 420, 215), 350, 1176, 600, framed=True)
MP_CAM = Region((1395, 655, 360, 245), 40, 1030, 292, framed=True)  # Buster-kun + incoming stamps, no bubble
MP_LAYOUT = [MP_CANVAS, MP_BOARD, MP_FEED, MP_CAM]

BGM_GAIN = 0.42
DUCK_DB = -10.0
SE_DB = -9.0
SE_DUCK_DB = -6.0
# The end card's first ~0.45 s is the bare dot background while its logo/card pop in: start after that, so the
# crossfade goes straight from the answer screen into the logo (no blank frame).
CTA_SKIP = 0.45


def voice_overlaps(s: 'Short', voices: dict, cta_at: float) -> list[str]:
    """Pairs of Buster-kun's lines that would talk over each other (should be none)."""
    spans = sorted((at, at + voices[line]['seconds'], line) for line, at in list(s.voices) + [('sv_cta', cta_at)])
    return [f'{a[2]} ↔ {b[2]} ({a[1] - b[0]:.2f}s)' for a, b in zip(spans, spans[1:]) if b[0] < a[1] - 0.02]

# All six game tracks (licenses confirmed), a different one per short.
BGM = {
    'short_quiz_01': 'title-2-lets-be-happy.mp3',
    'short_quiz_02': 'title-3-cube-sky.mp3',
    'short_quiz_03': 'game-3-ultra-oosouji.mp3',
    'short_recommend_01': 'game-1-jailbreak.mp3',
    'short_recommend_02': 'title-1-funky-droll-street.mp3',
    'short_recommend_03': 'game-2-ah-mou-mechakucha.mp3',
}

# ---------------------------------------------------------------------------------------------
# Buster-kun's lines for the shorts (official preset: 猫使ビィ / sample_A, trailer tempo)
# ---------------------------------------------------------------------------------------------

SHORT_LINES = [
    Line('sv_q_stop', 'ストップ！分かった人は、コメントに番号で答えるニャ！',
         captions=[('ストップ！', 1), ('分かった人は、', 1), ('コメントに番号で答えるニャ！', 1)]),
    Line('sv_q1_hook', 'この線、何を描いてるか分かるかニャ？', captions=[('この線、', 1), ('何を描いてるか分かるかニャ？', 1)]),
    Line('sv_q1_reveal', '正解は……ハクチョウ！数字の2だと思った人、正直にいいねするニャ！',
         tts='正解は……ハクチョウ！数字のニだと思った人、正直にいいねするニャ！',
         captions=[('正解は……', 1), ('ハクチョウ！', 1), ('数字の2だと思った人、', 1), ('正直にいいねするニャ！', 1)], anchor=1),
    Line('sv_q2_hook', '最初はただの玉ねぎ……？ここから何になるか当ててみるニャ！',
         captions=[('最初はただの玉ねぎ……？', 1), ('ここから何になるか当ててみるニャ！', 1)]),
    Line('sv_q2_reveal', '正解は……タージ・マハル！玉ねぎって答えた人、ボクの勝ちニャ！',
         tts='正解は……タージマハル！玉ねぎって答えた人、ボクの勝ちニャ！',
         captions=[('正解は……', 1), ('タージ・マハル！', 1), ('玉ねぎって答えた人、', 1), ('ボクの勝ちニャ！', 1)], anchor=1),
    Line('sv_q3_hook', 'ボウリングのピン？それとも……？ピンときたら天才ニャ！',
         captions=[('ボウリングのピン？', 1), ('それとも……？', 1), ('ピンときたら天才ニャ！', 1)]),
    Line('sv_q3_reveal', '正解は……ペンギン！くちばしの1本で気づいた人は、いいねニャ！',
         tts='正解は……ペンギン！くちばしのいっぽんで気づいた人は、いいねニャ！',
         captions=[('正解は……', 1), ('ペンギン！', 1), ('くちばしの1本で気づいた人は、', 1), ('いいねニャ！', 1)], anchor=1),
    Line('sv_cta', 'Steamで『AIお絵描きバスター』を検索ニャ！', tts='スチームで、エーアイお絵描きバスターを検索ニャ！',
         captions=[('Steamで', 1), ('『AIお絵描きバスター』を検索ニャ！', 1)]),
    Line('sv_r1_a', 'え、まだ1本しか描いてないニャ！？', tts='え、まだいっぽんしか描いてないニャ！？',
         captions=[('え、', 1), ('まだ1本しか描いてないニャ！？', 1)]),
    Line('sv_r1_b', 'ちょっ、待つニャ！速すぎるニャ！', captions=[('ちょっ、', 1), ('待つニャ！', 1), ('速すぎるニャ！', 1)]),
    Line('sv_r1_c', 'キミは何秒で当てられるかニャ？コメントで勝負ニャ！',
         captions=[('キミは何秒で当てられるかニャ？', 1), ('コメントで勝負ニャ！', 1)]),
    Line('sv_r2_intro', 'この線、何に見えるかニャ？', captions=[('この線、', 1), ('何に見えるかニャ？', 1)]),
    Line('sv_r2_rabbit', 'ブッブー！ピースサインじゃなくて、ウサギでしたニャwww',
         tts='ブッブー！ピースサインじゃなくて、ウサギでしたニャ、ニャハハ！',
         captions=[('ブッブー！', 1), ('ピースサインじゃなくて、', 1), ('ウサギでしたニャwww', 2)]),
    Line('sv_r2_busstop', '残念！ペロペロキャンディじゃなくて、バス停ニャ！',
         captions=[('残念！', 1), ('ペロペロキャンディじゃなくて、', 1), ('バス停ニャ！', 1)]),
    Line('sv_r2_pufferfish', '風船じゃなくて、フグでしたニャ〜！', captions=[('風船じゃなくて、', 1), ('フグでしたニャ〜！', 1)]),
    Line('sv_r2_end', 'キミは何問見抜けたかニャ？コメントで教えるニャ！',
         captions=[('キミは何問見抜けたかニャ？', 1), ('コメントで教えるニャ！', 1)]),
    Line('sv_r3_a', '最大8人で、オンライン早押しバトルニャ！', tts='最大ハチニンで、オンライン早押しバトルニャ！',
         captions=[('最大8人で、', 1), ('オンライン早押しバトルニャ！', 1)]),
    Line('sv_r3_b', 'ミリ秒差で、順位がひっくり返るニャ！', captions=[('ミリ秒差で、', 1), ('順位がひっくり返るニャ！', 1)]),
    Line('sv_r3_c', '一緒に遊びたい友達を、タグ付けするニャ！', captions=[('一緒に遊びたい友達を、', 1), ('タグ付けするニャ！', 1)]),
]

# Per quiz short: clip, hook telop, when to freeze (s after the drawing starts), hook line, reveal line.
QUIZ_SHORTS = {
    'short_quiz_01': ('quiz_swan', ('この線画、何に見える？', '初見で当てたら天才'), 2.4, 'sv_q1_hook', 'sv_q1_reveal'),
    'short_quiz_02': ('quiz_tajmahal', ('これ、何になると思う？', '最後まで見ると納得'), 1.7, 'sv_q2_hook', 'sv_q2_reveal'),
    'short_quiz_03': ('quiz_penguin', ('ボウリングのピン…？', 'それとも——'), 2.3, 'sv_q3_hook', 'sv_q3_reveal'),
}
THINK_COUNT = 5  # the pause: a 5-second countdown to think and write a comment
THINK_STEP = 0.9

# ---------------------------------------------------------------------------------------------
# PNG telops
# ---------------------------------------------------------------------------------------------


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_FILE, size, index=FONT_INDEX)


def fit_font(text: str, size: int, max_w: int) -> ImageFont.FreeTypeFont:
    f = font(size)
    while f.getlength(text) > max_w and size > 30:
        size -= 4
        f = font(size)
    return f


def outlined(d: ImageDraw.ImageDraw, xy, text, f, fill, stroke=10, anchor='ma'):
    d.text(xy, text, font=f, fill=fill, anchor=anchor, stroke_width=stroke, stroke_fill=INK)


def with_shadow(img: Image.Image, dx=8, dy=8, blur=3, alpha=170) -> Image.Image:
    a = img.split()[3]
    sh = Image.new('RGBA', img.size, (15, 23, 42, 0))
    sh.putalpha(a.point(lambda v: v * alpha // 255))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new('RGBA', (img.width + dx + blur * 2, img.height + dy + blur * 2), (0, 0, 0, 0))
    out.alpha_composite(sh, (dx, dy))
    out.alpha_composite(img, (0, 0))
    return out


SAFE_W = SAFE_R - SAFE_L


def hook_png(path: Path, line1: str, line2: str | None, color2=YELLOW) -> tuple[int, int]:
    """The hook: two big lines, white then yellow, thick ink outline — readable at a glance."""
    f1 = fit_font(line1, 84, SAFE_W - 40)
    f2 = fit_font(line2, 102, SAFE_W - 20) if line2 else None
    h = 112 + (128 if line2 else 0)
    img = Image.new('RGBA', (SAFE_W, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    outlined(d, (SAFE_W / 2, 8), line1, f1, WHITE, 14)
    if line2:
        outlined(d, (SAFE_W / 2, 114), line2, f2, color2, 16)
    img = with_shadow(img)
    img.save(path)
    return img.size


def badge_png(path: Path, text: str, bg=ROSE, size=64, rot=-4) -> tuple[int, int]:
    f = font(size)
    tw = int(f.getlength(text)) + 60
    th = size + 44
    img = Image.new('RGBA', (tw + 20, th + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((12, 12, tw + 12, th + 12), radius=24, fill=INK)
    d.rounded_rectangle((2, 2, tw, th), radius=24, fill=bg, outline=INK, width=7)
    outlined(d, (tw / 2, 20), text, f, WHITE, 8)
    img = img.rotate(rot, resample=Image.BICUBIC, expand=True)
    img.save(path)
    return img.size


def phrase_png(path: Path, text: str) -> tuple[int, int]:
    f = fit_font(text, 62, SAFE_W - 30)
    tw = int(f.getlength(text)) + 60
    img = Image.new('RGBA', (tw, 62 + 50), (0, 0, 0, 0))
    outlined(ImageDraw.Draw(img), (tw / 2, 18), text, f, WHITE, 10)
    img = with_shadow(img, 5, 5, 3, 150)
    img.save(path)
    return img.size


def number_png(path: Path, text: str) -> tuple[int, int]:
    f = font(320)
    img = Image.new('RGBA', (440, 400), (0, 0, 0, 0))
    outlined(ImageDraw.Draw(img), (220, 20), text, f, YELLOW, 24)
    img = with_shadow(img, 12, 12, 4, 200)
    img.save(path)
    return img.size


def options_png(path: Path, choices: list[str], answer: str | None = None, crossed: tuple[str, ...] = ()) -> tuple[int, int]:
    """The four choices as a wide 2x2 grid in the game's button colors. answer → highlight it, dim the rest."""
    total_w = OPTIONS_W  # full width under the canvas, inside the right-edge safe margin
    bw, bh, gap = (total_w - 12) // 2, 100, 12
    top, right = 16, 16  # room for the ◎/✕ badges that sit on each button's top-right corner, like in the game
    img = Image.new('RGBA', (bw * 2 + gap + 10 + right, bh * 2 + gap + 10 + top), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for i, label in enumerate(choices):
        x, y = (i % 2) * (bw + gap), (i // 2) * (bh + gap) + top
        dim = answer is not None and label != answer
        bg = BUTTON_BG[i] if not dim else (226, 232, 240, 255)
        d.rounded_rectangle((x + 6, y + 6, x + bw + 6, y + bh + 6), radius=20, fill=INK)
        d.rounded_rectangle((x, y, x + bw, y + bh), radius=20, fill=bg, outline=(250, 204, 21, 255) if label == answer else INK,
                            width=10 if label == answer else 6)
        f = fit_font(label, 60, bw - 112)
        d.text((x + 16, y + bh / 2), NUMS[i], font=font(58), fill=INK, anchor='lm')
        d.text((x + 86, y + bh / 2), label, font=f, fill=INK if not dim else (100, 116, 139, 255), anchor='lm')
        # Corner badges (clear of the label): ✕ on a fallen-for decoy, ◎ on the answer.
        bx0, by0 = x + bw - 44, y - top
        if label in crossed:
            d.ellipse((bx0, by0, bx0 + 58, by0 + 58), fill=(225, 29, 72, 255), outline=INK, width=5)
            d.line((bx0 + 18, by0 + 18, bx0 + 40, by0 + 40), fill=WHITE, width=8)
            d.line((bx0 + 40, by0 + 18, bx0 + 18, by0 + 40), fill=WHITE, width=8)
        if label == answer:
            d.ellipse((bx0, by0, bx0 + 58, by0 + 58), fill=WHITE, outline=INK, width=5)
            d.ellipse((bx0 + 13, by0 + 13, bx0 + 45, by0 + 45), outline=(225, 29, 72, 255), width=7)
    img.save(path)
    return img.size


def background_png(path: Path) -> None:
    """Cream dot paper with a soft sunburst — the game's own look, so the cut-out parts blend in."""
    img = Image.new('RGB', (W, H), (254, 243, 199))
    burst = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(burst)
    cx, cy = CX, 900
    for i in range(24):
        a0 = i / 24 * math.tau
        a1 = a0 + math.tau / 48
        d.polygon([(cx, cy), (cx + math.cos(a0) * 2400, cy + math.sin(a0) * 2400), (cx + math.cos(a1) * 2400, cy + math.sin(a1) * 2400)],
                  fill=(251, 191, 36, 40))
    img.paste(burst, (0, 0), burst)
    d = ImageDraw.Draw(img)
    for y in range(21, H, 42):
        for x in range(21, W, 42):
            d.ellipse((x - 3, y - 3, x + 3, y + 3), fill=(245, 208, 140))
    img.save(path)


def inset_frame_png(path: Path, w: int, h: int) -> tuple[int, int]:
    """Comic border + hard shadow around an inset (drawn under and over it: returns the full frame)."""
    pad = 10
    img = Image.new('RGBA', (w + pad * 2 + 10, h + pad * 2 + 10), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((pad - 3, pad - 3, pad + w + 3, pad + h + 3), radius=22, outline=INK, width=8)
    img.save(path)
    return img.size


def inset_shadow_png(path: Path, w: int, h: int) -> None:
    img = Image.new('RGBA', (w + 30, h + 30), (0, 0, 0, 0))
    ImageDraw.Draw(img).rounded_rectangle((10, 10, w + 10, h + 10), radius=20, fill=INK)
    img.save(path)


# ---------------------------------------------------------------------------------------------
# Timeline model
# ---------------------------------------------------------------------------------------------


@dataclass
class Shot:
    clip: str
    a: float
    b: float = 0.0
    freeze: float = 0.0  # > 0: hold the frame at `a` for this long (dimmed), instead of playing a..b

    @property
    def dur(self) -> float:
        return self.freeze if self.freeze else self.b - self.a


@dataclass
class Short:
    name: str
    title: str
    layout: list[Region]
    shots: list[Shot] = field(default_factory=list)
    overlays: list[tuple] = field(default_factory=list)  # (kind, args, x|None, y, t0, t1[, extra])
    voices: list[tuple[str, float]] = field(default_factory=list)  # (line, at)
    sfx: list[tuple[str, float, float]] = field(default_factory=list)  # (se, at, dB)
    notes: list[str] = field(default_factory=list)
    skip_caps: dict[str, int] = field(default_factory=dict)
    """line → how many of its leading subtitle phrases to leave out (the top hook already says them)."""

    @property
    def body(self) -> float:
        return sum(s.dur for s in self.shots)

    def at(self, clip: str, t: float) -> float | None:
        """Timeline time of clip time t (first shot that plays it)."""
        acc = 0.0
        for s in self.shots:
            if not s.freeze and s.clip == clip and s.a <= t <= s.b:
                return acc + t - s.a
            acc += s.dur
        return None

    def add(self, *shots: Shot) -> float:
        start = self.body
        self.shots.extend(shots)
        return start


def load(clip: str) -> tuple[dict, dict]:
    m = json.loads((CLIPS / f'{clip}.markers.json').read_text(encoding='utf-8'))
    meta_file = CLIPS / f'{clip}.meta.json'
    meta = json.loads(meta_file.read_text(encoding='utf-8')) if meta_file.exists() else {}
    return m, meta


# Handy positions on the solo canvas (frame coordinates).
CANVAS_TL = (SOLO_CANVAS.x + 30, SOLO_CANVAS.y + 30)
CANVAS_MID_Y = SOLO_CANVAS.y + SOLO_CANVAS.h // 2

# ---------------------------------------------------------------------------------------------
# The six shorts
# ---------------------------------------------------------------------------------------------


def quiz_short(name: str, voices: dict) -> Short:
    clip, (hook1, hook2), freeze_after, hook_line, reveal_line = QUIZ_SHORTS[name]
    m, meta = load(clip)
    s = Short(name, f'一時停止クイズ：{meta["answer"]}', SOLO_LAYOUT)
    live, answer, over = m['live'], m['answer'], m['reveal_over']
    fz = live + freeze_after
    hook_at = 0.25
    t_freeze = (fz - (live - 0.3))
    # 「ストップ！」 never talks over the hook line: it waits for it (the drawing is already frozen).
    stop_at = max(t_freeze + 0.05, hook_at + voices[hook_line]['seconds'] + 0.2)
    count_from = (stop_at - t_freeze) + 1.25  # the countdown starts once "ストップ！分かった人は…" is under way
    freeze_len = max(count_from + THINK_COUNT * THINK_STEP + 0.3, (stop_at - t_freeze) + voices['sv_q_stop']['seconds'] + 0.35)

    s.add(Shot(clip, live - 0.3, fz))
    s.add(Shot(clip, fz, freeze=freeze_len))
    t_resume = s.add(Shot(clip, fz, answer + 0.02))
    t_answer = t_resume + (answer - fz)
    s.add(Shot(clip, answer + 0.02, over - 0.08))
    # Afterglow: keep the solved drawing up while he finishes the line, plus a beat to react.
    hold = (voices[reveal_line]['seconds'] - voices[reveal_line]['anchor']) - (over - 0.08 - answer) + 1.3
    s.add(Shot(clip, over - 0.1, freeze=max(1.0, hold)))

    choices = meta['choices']
    s.overlays += [
        ('hook', (hook1, hook2), None, HOOK_Y, 0, t_freeze),
        ('hook', ('ここでストップ！', '答えは①〜④でコメント！'), None, HOOK_Y, t_freeze, t_resume, ROSE),
        ('hook', ('正解は…？', None), None, HOOK_Y + 50, t_resume, t_answer),
        ('hook', ('正解は', meta['answer'] + '！'), None, HOOK_Y, t_answer, s.body),
        ('options', (choices, None), OPTIONS_X, OPTIONS_Y, 0, t_answer),
        ('options', (choices, meta['answer']), OPTIONS_X, OPTIONS_Y, t_answer, s.body),
        ('badge', ('STOP！', (239, 68, 68, 255), 70, -5), *CANVAS_TL, t_freeze, t_resume),
    ]
    for k in range(THINK_COUNT):
        n = THINK_COUNT - k
        t0 = t_freeze + count_from + k * THINK_STEP
        s.overlays.append(('number', (str(n),), SOLO_CANVAS.x + SOLO_CANVAS.w // 2 - 220, CANVAS_MID_Y - 200, t0, t0 + THINK_STEP - 0.02))
        s.sfx.append(('countdown_1' if n == 1 else 'countdown_3', t0, -1))
    s.voices += [(hook_line, hook_at), ('sv_q_stop', stop_at), (reveal_line, t_answer - voices[reveal_line]['anchor'])]
    # 「正解は……」「ハクチョウ！」 are already the big top hook: the subtitle starts at the follow-up line, so the
    # answer isn't printed twice one above the other.
    s.skip_caps[reveal_line] = 2
    s.sfx += [('go', 0.05, -2), ('slam', t_freeze, 0), ('go', t_resume, -3), ('correct', t_answer, 0), ('sweep', t_answer, -5)]
    s.notes = [
        '冒頭0.3秒で線が描かれ始め、上部フックで「当てたくなる」状態を作る',
        f'描画途中で一時停止し、5秒のシンキングタイム（5→1カウント）＋選択肢①〜④で番号コメントを促す',
        '正解発表後は完成した絵を約1.3秒余韻として残し、リアクションの間を確保',
        'ミスリード選択肢をネタにした「引っかかった人はいいね」でいいね誘導',
    ]
    return s


def streak_short(voices: dict) -> Short:
    clip = 'streak'
    m, _ = load(clip)
    times = [m[f'answer{n}'] - m[f'live{n}'] for n in range(1, 6)]
    s = Short('short_recommend_01', '神速5連続即答チャレンジ', SOLO_LAYOUT)
    starts = []
    for n in range(1, 6):
        starts.append(s.add(Shot(clip, m[f'live{n}'] - 0.15, m[f'answer{n}'] + 1.4)))
    t_result = s.add(Shot(clip, m['result'] - 0.05, m['result'] + 3.1))
    s.add(Shot(clip, m['result'] + 3.05, freeze=max(0.6, voices['sv_r1_c']['seconds'] + 0.9 - 3.1)))
    best = min(times)
    s.overlays.append(('hook', (f'AIが描き始めて{best:.1f}秒で', '即答するエスパー'), None, HOOK_Y, 0, t_result))
    s.overlays.append(('hook', ('キミは何秒で', '当てられる？'), None, HOOK_Y, t_result, s.body))
    for n in range(5):
        t_ans = starts[n] + 0.15 + times[n]
        s.overlays.append(('badge', (f'{times[n]:.2f}秒！', (250, 204, 21, 255), 78, -6), SOLO_CANVAS.x + SOLO_CANVAS.w - 450, SOLO_CANVAS.y + 20, t_ans, t_ans + 1.25))
        s.overlays.append(('badge', (f'{n + 1}連続！', ROSE, 60, 5), SOLO_CANVAS.x + 300, SOLO_CANVAS.y + SOLO_CANVAS.h - 170, t_ans + 0.1, t_ans + 1.3))
        s.sfx.append((['critical', 'critical_combo2', 'critical_max', 'critical_max', 'critical_max'][n], t_ans, 0))
    t1 = starts[0] + 0.15 + times[0]
    t3 = starts[2] + 0.15 + times[2]
    s.voices += [('sv_r1_a', t1 + 0.25), ('sv_r1_b', t3 + 0.2), ('sv_r1_c', t_result + 0.3)]
    s.sfx += [('achievement', t1 + 0.12, -6), ('fanfare', t_result + 0.1, -4)]
    s.notes = [
        '1フレーム目から描画→即答が始まるコールドオープン（最初の1秒で離脱させない）',
        '毎回の回答タイムを「0.xx秒！」で大きく表示し「次はもっと速い？」で見続けさせる',
        '最後に「何秒で当てられる？」とコメントでの記録自慢・勝負を誘導',
        'テンポ重視：1問あたり約1.9秒のハードカットで5連続、リザルトで余韻',
    ]
    return s


TRAP_LINES = {'rabbit': 'sv_r2_rabbit', 'busstop': 'sv_r2_busstop', 'pufferfish': 'sv_r2_pufferfish'}


def traps_short(voices: dict) -> Short:
    clip = 'traps'
    m, meta = load(clip)
    s = Short('short_recommend_02', 'AIの罠3連発チャレンジ', SOLO_LAYOUT)
    last_end = 0.0
    for n, rnd in enumerate(meta['rounds'], 1):
        lead = 0.2
        if n == 1:  # room for 「この線、何に見えるかニャ？」 to finish before the first 「ブッブー」
            lead = max(lead, voices['sv_r2_intro']['seconds'] + 0.35 - (m['wrong1'] - m['live1']))
        t_live = s.add(Shot(clip, m[f'live{n}'] - lead, m[f'wrong{n}'] + 1.45)) + lead - 0.2
        t_wrong = t_live + (m[f'wrong{n}'] - m[f'live{n}']) + 0.2
        t_ans = s.add(Shot(clip, m[f'answer{n}'] - 0.15, m[f'answer{n}'] + 1.7)) + 0.15
        end = s.body
        ox = OPTIONS_X
        s.overlays += [
            ('badge', (f'第{n}問 / 3', (56, 189, 248, 255), 56, -3), *CANVAS_TL, t_live, t_live + 1.5),
            ('options', (rnd['choices'], None), ox, OPTIONS_Y, t_live, t_wrong),
            ('options', (rnd['choices'], None, (rnd['decoy'],)), ox, OPTIONS_Y, t_wrong, t_ans),
            ('options', (rnd['choices'], rnd['answer'], (rnd['decoy'],)), ox, OPTIONS_Y, t_ans, end),
            ('badge', ('引っかかった！', (239, 68, 68, 255), 76, 6), None, CANVAS_MID_Y - 60, t_wrong + 0.05, t_wrong + 1.4),
        ]
        s.voices.append((TRAP_LINES[rnd['quiz']], t_wrong + 0.05))
        last_end = t_wrong + 0.05 + voices[TRAP_LINES[rnd['quiz']]]['seconds']
        s.sfx += [('go', t_live + 0.05, -3), ('wrong', t_wrong, 0), ('correct', t_ans, -1)]
        if n == 1:
            s.voices.append(('sv_r2_intro', max(0.1, t_wrong - voices['sv_r2_intro']['seconds'] - 0.15)))
    t_end = s.body
    end_at = max(t_end + 0.1, last_end + 0.25)  # never over the last round's line
    s.add(Shot(clip, m['over3'] + 0.05, freeze=max(3.0, end_at - t_end + voices['sv_r2_end']['seconds'] + 0.9)))
    s.overlays.insert(0, ('hook', ('AIの罠、', '3問連続で見抜ける？'), None, HOOK_Y, 0, t_end))
    s.overlays.append(('hook', ('キミは何問', '見抜けた？'), None, HOOK_Y, t_end, s.body))
    s.voices.append(('sv_r2_end', end_at))
    s.notes = [
        '「3問連続で見抜ける？」という挑戦形式で最後まで見せる（視聴維持率↑）',
        '毎問、選択肢を表示 → 視聴者も一緒に考えられる参加型',
        'バスターくんの煽り＋「引っかかった！」スタンプで共感・笑い（シェア↑）',
        'ラストに「何問見抜けた？」とスコアのコメントを誘導、余韻も長めに確保',
    ]
    return s


def mp_short(voices: dict) -> Short:
    clip = 'mp8'
    m, _ = load(clip)
    s = Short('short_recommend_03', '8人オンライン早押しカオス', MP_LAYOUT)
    s.add(Shot(clip, m['lobby'] - 0.6, m['host_answer1'] + 2.4))
    t_b = s.add(Shot(clip, m['round_end1'] - 0.1, m['round_end1'] + 2.0))
    s.add(Shot(clip, m['live2'] - 0.8, m['host_answer2'] + 2.2))
    t_d = s.add(Shot(clip, m['round_end2'] - 0.1, m['next2'] + 0.35))
    s.add(Shot(clip, m['next2'] + 0.3, freeze=max(0.8, voices['sv_r3_c']['seconds'] + 1.0 - (s.body - t_d))))
    t_live1 = s.at(clip, m['live1'])
    s.overlays += [
        ('hook', ('8人で同時に', '早押しすると…'), None, HOOK_Y, 0, t_live1),
        ('hook', ('ミリ秒差の', '大混戦！'), None, HOOK_Y, t_live1, t_d),
        ('hook', ('友達をタグ付けして', '一緒に挑戦！'), None, HOOK_Y, t_d, s.body),
    ]
    s.voices += [('sv_r3_a', 0.2), ('sv_r3_b', t_b + 0.1), ('sv_r3_c', t_d + 0.1)]
    for r in (1, 2):
        live = m[f'live{r}']
        for dt, se in ((-1.8, 'countdown_3'), (-1.2, 'countdown_3'), (-0.6, 'countdown_1'), (0, 'go')):
            t = s.at(clip, live + dt)
            if t is not None:
                s.sfx.append((se, t, -2))
        for key, se, db in ((f'host_answer{r}', 'correct', 0), (f'round_end{r}', 'slam', -3)):
            t = s.at(clip, m[key])
            if t is not None:
                s.sfx.append((se, t, db))
    stamp_n = 0
    for k, t in sorted(m.items(), key=lambda kv: kv[1]):
        if not k.startswith('bot'):
            continue
        tt = s.at(clip, t + 0.08)
        if tt is None:
            continue
        if '_correct_' in k:
            s.sfx.append(('click', tt, -3))
        elif '_wrong_' in k:
            s.sfx.append(('wrong', tt, -8))
        elif '_stamp_' in k:
            s.sfx.append((f'tick_{min(stamp_n, 9)}', tt, -1))
            stamp_n += 1
    s.notes = [
        '「8人で同時に早押しすると…」の続きが気になるフックで冒頭離脱を防止',
        '8人の順位表・最速タイムの通知・スタンプを縦画面に並べ直し、ミリ秒差の攻防が一目で分かる構成',
        'ラストに「友達をタグ付け」→ コメント欄でのタグ付け・シェアを誘導（拡散↑）',
        '2ラウンドをハードカットで凝縮し、待ち時間をカット',
    ]
    return s


def all_shorts(voices: dict) -> dict:
    return {
        'short_quiz_01': lambda: quiz_short('short_quiz_01', voices),
        'short_quiz_02': lambda: quiz_short('short_quiz_02', voices),
        'short_quiz_03': lambda: quiz_short('short_quiz_03', voices),
        'short_recommend_01': lambda: streak_short(voices),
        'short_recommend_02': lambda: traps_short(voices),
        'short_recommend_03': lambda: mp_short(voices),
    }


# ---------------------------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------------------------


def render(s: Short, voices: dict, ffmpeg: str, tmp: Path) -> float:
    cta_m, _ = load('cta_vertical')
    cta_from = cta_m['in'] + CTA_SKIP
    cta_len = max(3.2, voices['sv_cta']['seconds'] + 0.7)
    xf = 0.25
    body = s.body
    total = body + cta_len - xf

    args = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
    fc: list[str] = []
    n = 0

    # 1. The full 1920x1080 game timeline (shots + dimmed freezes).
    parts = []
    for sh in s.shots:
        if sh.freeze:
            args += ['-ss', f'{sh.a:.3f}', '-t', '0.1', '-i', str(CLIPS / f'{sh.clip}.mp4')]
            fc.append(
                f'[{n}:v]trim=end_frame=1,setsar=1,fps={FPS},eq=brightness=-0.05:saturation=0.8,'
                f'tpad=stop_mode=clone:stop_duration={sh.freeze:.3f},trim=duration={sh.freeze:.3f},setpts=PTS-STARTPTS,format=yuv420p[p{n}]'
            )
        else:
            args += ['-ss', f'{sh.a:.3f}', '-t', f'{sh.dur:.3f}', '-i', str(CLIPS / f'{sh.clip}.mp4')]
            fc.append(f'[{n}:v]setsar=1,fps={FPS},setpts=PTS-STARTPTS,format=yuv420p[p{n}]')
        parts.append(f'[p{n}]')
        n += 1
    fc.append(f'{"".join(parts)}concat=n={len(parts)}:v=1:a=0,settb=1/{FPS * 1000},fps={FPS},split={len(s.layout)}{"".join(f"[g{i}]" for i in range(len(s.layout)))}')

    # 2. Background, then every region cut out of the game and placed (insets get a shadow and a border).
    bg = tmp / 'bg.png'
    background_png(bg)
    args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{body:.3f}', '-i', str(bg)]
    fc.append(f'[{n}:v]format=yuv420p[bg0]')
    n += 1
    cur = '[bg0]'
    for i, r in enumerate(s.layout):
        cx, cy, cw, ch = r.crop
        if r.framed:
            shadow = tmp / f'shadow{i}.png'
            inset_shadow_png(shadow, r.w, r.h)
            args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{body:.3f}', '-i', str(shadow)]
            fc.append(f'{cur}[{n}:v]overlay=x={r.x - 2}:y={r.y - 2}[sh{i}]')
            cur = f'[sh{i}]'
            n += 1
        fc.append(f'[g{i}]crop={cw}:{ch}:{cx}:{cy},scale={r.w}:{r.h}:flags=lanczos,setsar=1[r{i}]')
        fc.append(f'{cur}[r{i}]overlay=x={r.x}:y={r.y}:eof_action=pass[l{i}]')
        cur = f'[l{i}]'
        if r.framed:
            frame = tmp / f'frame{i}.png'
            inset_frame_png(frame, r.w, r.h)
            args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{body:.3f}', '-i', str(frame)]
            fc.append(f'{cur}[{n}:v]overlay=x={r.x - 10}:y={r.y - 10}[fr{i}]')
            cur = f'[fr{i}]'
            n += 1

    # 3. Telops.
    overlays = []  # (png, x, y, t0, t1, fade)
    for k, ov in enumerate(s.overlays):
        kind, a, x, y, t0, t1 = ov[:6]
        png = tmp / f'o{k}.png'
        if kind == 'hook':
            w, h = hook_png(png, a[0], a[1], ov[6] if len(ov) > 6 else YELLOW)
            x = SAFE_L
        elif kind == 'badge':
            w, h = badge_png(png, *a)
        elif kind == 'number':
            w, h = number_png(png, a[0])
        elif kind == 'options':
            w, h = options_png(png, a[0], a[1], a[2] if len(a) > 2 else ())
        else:
            raise ValueError(kind)
        overlays.append((png, CX - w // 2 if x is None else x, y, t0, t1, 0.06 if kind != 'hook' else 0.1))
    k = 1000
    for line, at in s.voices:
        caps = voices[line]['captions']
        for j, cap in enumerate(caps):
            if j < s.skip_caps.get(line, 0):
                continue
            t0 = at + cap['start'] - 0.04
            t1 = at + (caps[j + 1]['start'] - 0.04 if j + 1 < len(caps) else cap['end'] + 0.3)
            png = tmp / f'c{k}.png'
            w, h = phrase_png(png, cap['text'])
            overlays.append((png, CX - w // 2, PHRASE_Y, t0, min(t1, body), 0.04))
            k += 1
    for j, (png, x, y, t0, t1, fd) in enumerate(overlays):
        t0, t1 = max(0.0, t0), min(body, t1)
        if t1 - t0 < 0.05:
            continue
        dur = t1 - t0
        args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{dur:.3f}', '-i', str(png)]
        fc.append(
            f'[{n}:v]format=rgba,fade=t=in:st=0:d={fd}:alpha=1,fade=t=out:st={max(0, dur - fd):.3f}:d={fd}:alpha=1,'
            f'setpts=PTS-STARTPTS+{t0:.3f}/TB[t{j}]'
        )
        fc.append(f"{cur}[t{j}]overlay=x={x}:y={y}:eof_action=pass:enable='between(t,{t0:.3f},{t1:.3f})'[v{j}]")
        cur = f'[v{j}]'
        n += 1
    fc.append(f'{cur}trim=duration={body:.3f},format=yuv420p,setsar=1[body]')

    # 4. End card (CTA), crossfaded in.
    args += ['-ss', f'{cta_from:.3f}', '-t', f'{cta_len:.3f}', '-i', str(CLIPS / 'cta_vertical.mp4')]
    fc.append(f'[{n}:v]fps={FPS},scale={W}:{H},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[cta]')
    n += 1
    fc.append(f'[body][cta]xfade=transition=fade:duration={xf}:offset={body - xf:.3f},fade=t=in:st=0:d=0.12[vout]')

    # 5. Audio: voices (+ the CTA line), SE, BGM ducked under the voices.
    voice_list = list(s.voices) + [('sv_cta', body - xf + 0.35)]
    for clash in voice_overlaps(s, voices, body - xf + 0.35):
        print(f'  ! {s.name}: voices overlap: {clash}')
    mix, spans = [], []
    for i, (line, at) in enumerate(voice_list):
        args += ['-i', str(VOICE / f'{line}.wav')]
        fc.append(f'[{n}:a]aresample=48000,adelay={int(max(0, at) * 1000)}:all=1[a{i}]')
        mix.append(f'[a{i}]')
        spans.append((at, at + voices[line]['seconds']))
        n += 1
    env = None
    for a, b in spans:
        r = f'clip(min((t-{a - 0.15:.3f})/0.15,({b + 0.25:.3f}-t)/0.25),0,1)'
        env = r if env is None else f'max({env},{r})'
    se_labels = []
    for i, (name, at, db) in enumerate(list(s.sfx) + [('go', body - xf + 0.1, -3)]):
        if at < 0 or at > total - 0.1:
            continue
        args += ['-i', str(SE / f'{name}.wav')]
        fc.append(f'[{n}:a]aresample=48000,volume={SE_DB + db}dB,adelay={int(at * 1000)}:all=1,apad=whole_dur={total:.3f}[e{i}]')
        se_labels.append(f'[e{i}]')
        n += 1
    if se_labels:
        # SE bus: game sounds step back (-6 dB) while Buster-kun talks, so no line is masked.
        se_duck = 1 - 10 ** (SE_DUCK_DB / 20)
        fc.append(f"{''.join(se_labels)}amix=inputs={len(se_labels)}:normalize=0:duration=longest,atrim=0:{total:.3f},"
                  f"volume='1-{se_duck:.4f}*{env}':eval=frame[sebus]")
        mix.append('[sebus]')
    duck = 1 - 10 ** (DUCK_DB / 20)
    args += ['-stream_loop', '-1', '-i', str(BGM_DIR / BGM[s.name])]
    fc.append(
        f"[{n}:a]aresample=48000,atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={BGM_GAIN},"
        f"volume='1-{duck:.4f}*{env}':eval=frame,afade=t=out:st={total - 0.8:.3f}:d=0.8[bgm]"
    )
    n += 1
    fc.append(f'[bgm]{"".join(mix)}amix=inputs={len(mix) + 1}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[aout]')

    graph = tmp / 'graph.txt'
    graph.write_text(';\n'.join(fc), encoding='utf-8')
    out = OUT / f'{s.name}.mp4'
    args += [
        '-/filter_complex', str(graph), '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', str(FPS), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{total:.3f}', '-movflags', '+faststart', str(out),
    ]
    subprocess.run(args, check=True)
    return total


def layout_sheet(ffmpeg: str, report: list) -> Path:
    """One frame per short (plus the safe zones drawn in) side by side, for checking the layout."""
    sheet_path = OUT / 'layout_check.png'
    frames = []
    with tempfile.TemporaryDirectory(prefix='adb_sheet_') as tmp:
        for name, s, real, _ in report:
            t = {'short_quiz_01': 1.4, 'short_quiz_02': 1.4, 'short_quiz_03': 1.4}.get(name, s.body * 0.35)
            png = Path(tmp) / f'{name}.png'
            subprocess.run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-ss', f'{t:.2f}', '-i', str(OUT / f'{name}.mp4'), '-frames:v', '1', str(png)], check=True)
            im = Image.open(png).convert('RGBA')
            zone = Image.new('RGBA', im.size, (0, 0, 0, 0))
            d = ImageDraw.Draw(zone)
            d.rectangle((0, 0, W, SAFE_T), fill=(239, 68, 68, 70))  # platform search / tabs
            d.rectangle((W - 120, SAFE_T, W, H - 280), fill=(239, 68, 68, 70))  # platform icons
            d.rectangle((0, H - 280, W, H), fill=(239, 68, 68, 70))  # platform captions
            im.alpha_composite(zone)
            if name == 'short_quiz_01':
                im.convert('RGB').resize((540, 960)).save(OUT / 'layout_detail.png')
            frames.append(im.convert('RGB').resize((360, 640)))
    sheet = Image.new('RGB', (len(frames) * 370 - 10, 640), (40, 40, 40))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * 370, 0))
    sheet.save(sheet_path)
    return sheet_path


# ---------------------------------------------------------------------------------------------


def ensure_sources(refresh: bool) -> dict:
    manifest_file = VOICE / 'voices.json'
    have = json.loads(manifest_file.read_text(encoding='utf-8')) if manifest_file.exists() else {}
    missing = [l for l in SHORT_LINES if l.name not in have or not (VOICE / f'{l.name}.wav').exists()]
    if missing and refresh:
        print(f'Generating {len(missing)} voice lines…')
        have = render_lines(missing, VOICE, quiet=True)
    if refresh and not (SE / 'critical_max.wav').exists():
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'render_game_sfx.py')], check=True)
    need = ['quiz_swan', 'quiz_tajmahal', 'quiz_penguin', 'traps', 'streak', 'mp8', 'cta_vertical']
    missing_clips = [c for c in need if not (CLIPS / f'{c}.mp4').exists() or not (CLIPS / f'{c}.markers.json').exists()]
    if missing_clips and refresh:
        subprocess.run([sys.executable, str(ROOT / 'scripts' / 'record_shorts.py'), '--only', ','.join(missing_clips)], check=True)
    return have


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--only', help='comma-separated short names')
    ap.add_argument('--no-refresh', action='store_true')
    ap.add_argument('--preview', action='store_true', help='also write promo_assets/shorts/layout_check.png')
    args = ap.parse_args()
    voices = ensure_sources(not args.no_refresh)
    OUT.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    ffprobe = str(Path(ffmpeg).with_name('ffprobe' + Path(ffmpeg).suffix))
    table = all_shorts(voices)
    names = args.only.split(',') if args.only else list(table)
    report = []
    for name in names:
        s = table[name]()
        with tempfile.TemporaryDirectory(prefix='adb_short_') as tmp:
            render(s, voices, ffmpeg, Path(tmp))
        out = OUT / f'{name}.mp4'
        real = float(subprocess.run([ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(out)], capture_output=True, text=True).stdout)
        report.append((name, s, real, out.stat().st_size))
        print(f'● {name}  {real:.2f}s  {out.stat().st_size / 1024 / 1024:.1f} MB  — {s.title}  (BGM: {BGM[name]})')
    if args.preview:
        print(f'\nレイアウト確認用画像: {layout_sheet(ffmpeg, report)}')
    print('\n==================== ショート動画 完成レポート ====================')
    for name, s, real, size in report:
        print(f'\n■ {name}.mp4 — {s.title}')
        print(f'  尺 {real:.2f}s / {size / 1024 / 1024:.1f} MB / 1080x1920 60fps / BGM {BGM[name]}')
        for note in s.notes:
            print(f'  ・{note}')


if __name__ == '__main__':
    main()

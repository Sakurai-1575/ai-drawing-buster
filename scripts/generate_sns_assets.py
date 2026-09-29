#!/usr/bin/env python3
"""
Generate the SNS images for AIお絵描きバスター (X / YouTube / TikTok).

    python scripts/generate_sns_assets.py [--out DIR] [--font PATH]

Writes:
    icon_buster.png      1024x1024  profile icon (all platforms; safe for a circular crop)
    header_x.png         1500x500   X header (bottom-left kept clear for the profile icon)
    header_youtube.png   2048x1152  YouTube banner (logo + Buster-kun inside the 1546x423 safe area)

Nothing is cropped from a screenshot: Buster-kun is redrawn from the same vector geometry as
src/components/MascotCharacter.tsx, and the background doodles reuse the quiz strokes from
src/data/quizzesVol1.ts, so everything stays sharp at any size. Only Pillow is required.
"""
from __future__ import annotations

import argparse
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ---------------------------------------------------------------------------------------------
# Palette (same values as the game)
# ---------------------------------------------------------------------------------------------
INK = '#0f172a'
SHELL = '#fde68a'
SCREEN = '#1e293b'
GLOW = '#5eead4'
ROSE = '#fb7185'
PINK = '#fda4af'
RED = '#e11d48'
SKY = '#7dd3fc'
STAR = '#fde047'
WHITE = '#ffffff'
BEIGE = '#F3EACD'
GRID_MINOR = '#e4d7b0'
GRID_MAJOR = '#d6c592'
PAPER_GRID = '#e2e8f0'

TITLE = 'AIお絵描きバスター'
BADGE = 'REAL-TIME SKETCH QUIZ'
CATCH = 'AIの落書きを最速で見抜くニャ！🐈'

SS = 4  # supersampling for the vector parts (Pillow's shapes aren't anti-aliased)

ROOT = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------------------------
# Fonts
# ---------------------------------------------------------------------------------------------
# The game's --font-game stack, in the order each OS resolves it (index = face inside a .ttc).
JP_FONTS = [
    ('/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc', 0),
    ('C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1),  # BIZ UDPGothic Bold
    ('C:/Windows/Fonts/YuGothB.ttc', 0),
    ('C:/Windows/Fonts/meiryob.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc', 0),
    ('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', 0),
    ('/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc', 0),
]
EMOJI_FONTS = [
    ('C:/Windows/Fonts/seguiemj.ttf', None),  # COLR: any size
    ('/System/Library/Fonts/Apple Color Emoji.ttc', 160),  # bitmap: fixed strike
    ('/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf', 109),
]

_font_override: str | None = None


def jp_font(size: int) -> ImageFont.FreeTypeFont:
    candidates = [(_font_override, 0)] if _font_override else JP_FONTS
    for path, index in candidates:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size, index=index)
    raise SystemExit('No Japanese font found. Pass one with --font PATH (e.g. a Noto Sans CJK .ttc/.otf).')


def is_emoji(ch: str) -> bool:
    cp = ord(ch)
    return cp >= 0x1F000 or 0x2600 <= cp <= 0x27BF


def render_emoji(ch: str, size: int) -> Image.Image | None:
    """Color emoji as an RGBA tile about `size` px tall, or None if no emoji font is installed."""
    for path, strike in EMOJI_FONTS:
        if not Path(path).exists():
            continue
        font = ImageFont.truetype(path, strike or size)
        box = font.getbbox(ch)
        tile = Image.new('RGBA', (box[2] + 4, box[3] + 4))
        ImageDraw.Draw(tile).text((0, 0), ch, font=font, embedded_color=True)
        tile = tile.crop(tile.getbbox())
        k = size / tile.height
        return tile.resize((max(1, round(tile.width * k)), size), Image.LANCZOS)
    return None


# ---------------------------------------------------------------------------------------------
# Small vector painter: enough SVG path syntax for MascotCharacter.tsx (M L H V C Q Z, abs/rel)
# ---------------------------------------------------------------------------------------------
_TOKEN = re.compile(r'[MmLlHhVvCcQqZz]|-?(?:\d+\.?\d*|\.\d+)')


def parse_path(d: str, steps: int = 20) -> list[tuple[list[tuple[float, float]], bool]]:
    toks = _TOKEN.findall(d)
    subpaths: list[tuple[list[tuple[float, float]], bool]] = []
    pts: list[tuple[float, float]] | None = None
    x = y = 0.0
    start = (0.0, 0.0)
    cmd = 'M'
    i = 0

    def num() -> float:
        nonlocal i
        i += 1
        return float(toks[i - 1])

    while i < len(toks):
        if toks[i].isalpha():
            cmd = toks[i]
            i += 1
            if cmd in 'Zz':
                if pts is not None:
                    subpaths[-1] = (pts, True)
                x, y = start
                pts = None
            continue
        rel = cmd.islower()
        ox, oy = (x, y) if rel else (0.0, 0.0)
        op = cmd.upper()
        if op == 'M':
            x, y = ox + num(), oy + num()
            start = (x, y)
            pts = [(x, y)]
            subpaths.append((pts, False))
            cmd = 'l' if rel else 'L'  # extra pairs after M are implicit linetos
            continue
        if pts is None:
            pts = [(x, y)]
            subpaths.append((pts, False))
        if op == 'L':
            x, y = ox + num(), oy + num()
            pts.append((x, y))
        elif op == 'H':
            x = ox + num()
            pts.append((x, y))
        elif op == 'V':
            y = oy + num()
            pts.append((x, y))
        elif op == 'C':
            c1 = (ox + num(), oy + num())
            c2 = (ox + num(), oy + num())
            end = (ox + num(), oy + num())
            p0 = (x, y)
            for s in range(1, steps + 1):
                t = s / steps
                u = 1 - t
                pts.append(tuple(u**3 * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t**3 * end[k] for k in (0, 1)))
            x, y = end
        elif op == 'Q':
            c = (ox + num(), oy + num())
            end = (ox + num(), oy + num())
            p0 = (x, y)
            for s in range(1, steps + 1):
                t = s / steps
                u = 1 - t
                pts.append(tuple(u * u * p0[k] + 2 * u * t * c[k] + t * t * end[k] for k in (0, 1)))
            x, y = end
        else:
            raise ValueError(f'Unsupported path command {cmd!r} in {d!r}')
    return subpaths


class Painter:
    """Draws SVG-unit geometry onto an RGBA image at `scale` px per unit, offset by (ox, oy) px."""

    def __init__(self, img: Image.Image, scale: float, ox: float = 0, oy: float = 0):
        self.img = img
        self.draw = ImageDraw.Draw(img)
        self.s = scale
        self.ox = ox
        self.oy = oy

    def xy(self, x: float, y: float) -> tuple[float, float]:
        return (self.ox + x * self.s, self.oy + y * self.s)

    def polyline(self, pts, color, width: float, closed: bool = False) -> None:
        """Stroke with round caps and joins, like stroke-linecap/linejoin="round"."""
        px = [self.xy(*p) for p in pts]
        if closed:
            px.append(px[0])
        w = width * self.s
        if len(px) > 1:
            self.draw.line(px, fill=color, width=max(1, round(w)), joint='curve')
        r = w / 2
        for cx, cy in px:
            self.draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color)

    def path(self, d: str, fill=None, stroke=None, width: float = 3.5, transform=(0.0, 0.0, 1.0)) -> None:
        tx, ty, k = transform
        subpaths = [([(tx + px * k, ty + py * k) for px, py in pts], closed) for pts, closed in parse_path(d)]
        if fill:
            for pts, _ in subpaths:
                if len(pts) >= 3:
                    self.draw.polygon([self.xy(*p) for p in pts], fill=fill)
        if stroke:
            for pts, closed in subpaths:
                self.polyline(pts, stroke, width * k, closed)

    def rrect(self, x, y, w, h, r, fill, stroke=INK, width: float = 3.5) -> None:
        """Rounded rect with a centered stroke (outer shape in stroke color, inner in fill)."""
        hw = width / 2
        outer = [*self.xy(x - hw, y - hw), *self.xy(x + w + hw, y + h + hw)]
        inner = [*self.xy(x + hw, y + hw), *self.xy(x + w - hw, y + h - hw)]
        self.draw.rounded_rectangle(outer, radius=(r + hw) * self.s, fill=stroke)
        self.draw.rounded_rectangle(inner, radius=max(0, r - hw) * self.s, fill=fill)

    def ellipse(self, cx, cy, rx, ry, fill=None, stroke=None, width: float = 3.5) -> None:
        hw = width / 2 if stroke else 0
        if stroke:
            self.draw.ellipse([*self.xy(cx - rx - hw, cy - ry - hw), *self.xy(cx + rx + hw, cy + ry + hw)], fill=stroke)
        if fill:
            self.draw.ellipse([*self.xy(cx - rx + hw, cy - ry + hw), *self.xy(cx + rx - hw, cy + ry - hw)], fill=fill)

    def translucent(self, opacity: float, paint) -> None:
        """Run `paint(painter)` on a scratch layer and blend it in at `opacity` (SVG stroke-opacity)."""
        layer = Image.new('RGBA', self.img.size)
        paint(Painter(layer, self.s, self.ox, self.oy))
        layer.putalpha(layer.getchannel('A').point(lambda a: round(a * opacity)))
        self.img.alpha_composite(layer)


def drop_shadow(img: Image.Image, dx: int, dy: int, color=INK) -> Image.Image:
    """Hard offset shadow (CSS drop-shadow / box-shadow with 0 blur)."""
    out = Image.new('RGBA', (img.width + abs(dx), img.height + abs(dy)))
    shadow = Image.new('RGBA', img.size, color)
    shadow.putalpha(img.getchannel('A'))
    out.alpha_composite(shadow, (max(dx, 0), max(dy, 0)))
    out.alpha_composite(img, (max(-dx, 0), max(-dy, 0)))
    return out


def downsample(img: Image.Image, factor: int = SS) -> Image.Image:
    return img.resize((round(img.width / factor), round(img.height / factor)), Image.LANCZOS)


# ---------------------------------------------------------------------------------------------
# Buster-kun (port of src/components/MascotCharacter.tsx)
# ---------------------------------------------------------------------------------------------
PENCIL = {
    'body': ('M14 30 L38 6 L48 16 L24 40 Z', '#fcd34d'),
    'eraser': ('M38 6 L42 2 L52 12 L48 16 Z', ROSE),
    'wood': ('M14 30 L24 40 L5 49 Z', '#fde7c7'),
}
PENCIL_GRAPHITE = 'M5 49 L8.5 41.5 L12.5 45.5 Z'


def render_mascot(height: int, expression: str = 'normal', variant: str = 'full') -> Image.Image:
    """Buster-kun as a trimmed RGBA image roughly `height` px tall, with the game's 3px ink drop shadow."""
    head = variant == 'head'
    vx, vy, vw, vh = (4, 2, 112, 98) if head else (0, 0, 120, 132)
    pad = 10  # room for strokes, the sparkle and the shadow outside the viewBox
    s = height * SS / vh
    img = Image.new('RGBA', (round((vw + 2 * pad) * s), round((vh + 2 * pad) * s)))
    p = Painter(img, s, (pad - vx) * s, (pad - vy) * s)

    if not head:
        p.path('M36 112 C18 116 10 104 16 94 C20 88 28 92 24 98', stroke=INK)  # tail
        p.path('M40 94 H80 L86 118 H34 Z', fill=SHELL, stroke=INK)  # body
        p.path('M28 118 H92 V126 H28 Z', fill=ROSE, stroke=INK)  # stand
    # ears
    p.path('M20 32 L28 6 L48 24 Z', fill=SHELL, stroke=INK)
    p.path('M100 32 L92 6 L72 24 Z', fill=SHELL, stroke=INK)
    p.path('M27 24 L30 14 L38 22 Z', fill=PINK, stroke=INK, width=2)
    p.path('M93 24 L90 14 L82 22 Z', fill=PINK, stroke=INK, width=2)
    # CRT head
    p.rrect(10, 20, 100, 76, 16, SHELL)
    p.rrect(20, 29, 80, 54, 11, SCREEN)
    p.ellipse(86, 89.5, 2.6, 2.6, fill=ROSE, stroke=INK, width=2)
    p.ellipse(96, 89.5, 2.6, 2.6, fill=GLOW, stroke=INK, width=2)
    # glare + scanlines
    p.translucent(0.35, lambda q: q.path('M26 36 Q30 32 40 32', stroke=WHITE, width=3))
    p.translucent(0.08, lambda q: [q.polyline([(22, y), (98, y)], GLOW, 1.5) for y in (40, 48, 56, 64, 72)])

    whiskers = 'M30 63 h9 M31 69 l8 -3 M90 63 h-9 M89 69 l-8 -3'
    if expression == 'wink':
        p.ellipse(46, 52, 5, 6.5, fill=GLOW)
        p.path('M67 54 q7 -8 14 0', stroke=GLOW, width=3.2)
        p.path('M48 64 q12 10 24 0', stroke=GLOW, width=3.2)
        p.path('M53 66.5 l2 4 l2 -3', stroke=GLOW, width=2)
        p.path(whiskers, stroke=GLOW, width=2)
    else:  # normal
        p.ellipse(46, 52, 5, 6.5, fill=GLOW)
        p.ellipse(74, 52, 5, 6.5, fill=GLOW)
        p.path('M52 66 q4 5 8 0 q4 5 8 0', stroke=GLOW, width=3.2)
        p.path(whiskers, stroke=GLOW, width=2)

    if not head:
        # paw clutching a pencil
        p.path('M82 104 Q90 110 96 110', stroke=INK)
        tf = (82.6, 90.7, 0.68)
        for d, color in PENCIL.values():
            p.path(d, fill=color, stroke=INK, width=4.5, transform=tf)
        p.path(PENCIL_GRAPHITE, fill=INK, transform=tf)
        p.ellipse(100, 108, 7.5, 7.5, fill=SHELL, stroke=INK)
        p.path('M97 104 v4 M101 103 v4', stroke=INK, width=2)

    if expression == 'wink':
        p.path('M110 8 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z', fill=STAR, stroke=INK, width=2)

    img = downsample(img)
    shadow = max(2, round(height * 2.4 / vh))  # the SVG's drop-shadow is 3px at 160px wide
    img = drop_shadow(img, shadow, shadow)
    return img.crop(img.getbbox())


# ---------------------------------------------------------------------------------------------
# Quiz doodles (strokes copied from src/data/quizzesVol1.ts; helpers from src/data/shapes.ts)
# ---------------------------------------------------------------------------------------------
def line(*pts):
    return list(pts)


def arc(cx, cy, rx, ry, a0, a1, steps=28):
    return [(cx + rx * math.cos(math.radians(a0 + (a1 - a0) * i / steps)),
             cy + ry * math.sin(math.radians(a0 + (a1 - a0) * i / steps))) for i in range(steps + 1)]


def circle(cx, cy, r, start=-90, steps=36):
    return arc(cx, cy, r, r, start, start + 360, steps)


def curve(p0, c, p1, steps=16):
    return [tuple((1 - t) ** 2 * p0[k] + 2 * (1 - t) * t * c[k] + t * t * p1[k] for k in (0, 1))
            for t in (i / steps for i in range(steps + 1))]


def join(*parts):
    out = list(parts[0])
    for part in parts[1:]:
        out += part[1:]
    return out


def mirror(stroke):
    return [(1 - x, y) for x, y in stroke]


def rays(cx, cy, r0, r1, count, offset=-90):
    out = []
    for i in range(count):
        a = math.radians(offset + 360 / count * i)
        out.append([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))])
    return out


def pentagram(cx, cy, r):
    def outer(k):
        a = math.radians(-90 + 72 * k)
        return (cx + r * math.cos(a), cy + r * math.sin(a))
    return [outer(k) for k in (3, 0, 2, 4, 1, 3)]


DOODLES = {
    'apple': [
        line((0.5, 0.3), (0.53, 0.1)),
        join(curve((0.52, 0.18), (0.62, 0.05), (0.75, 0.13)), curve((0.75, 0.13), (0.65, 0.26), (0.52, 0.18))),
        join(curve((0.5, 0.3), (0.28, 0.16), (0.18, 0.45)), curve((0.18, 0.45), (0.16, 0.88), (0.5, 0.87))),
        join(curve((0.5, 0.3), (0.72, 0.16), (0.82, 0.45)), curve((0.82, 0.45), (0.84, 0.88), (0.5, 0.87))),
        curve((0.3, 0.52), (0.28, 0.41), (0.35, 0.34)),
    ],
    'fish': [
        line((0.78, 0.5), (0.94, 0.33), (0.94, 0.67), (0.78, 0.5)),
        curve((0.78, 0.5), (0.5, 0.18), (0.1, 0.5)),
        curve((0.1, 0.5), (0.5, 0.82), (0.78, 0.5)),
        circle(0.24, 0.46, 0.025, -90, 14),
        curve((0.36, 0.38), (0.41, 0.5), (0.36, 0.62)),
        curve((0.48, 0.34), (0.56, 0.24), (0.62, 0.36)),
    ],
    'house': [
        line((0.43, 0.88), (0.43, 0.67), (0.57, 0.67), (0.57, 0.88)),
        line((0.64, 0.52), (0.76, 0.52), (0.76, 0.64), (0.64, 0.64), (0.64, 0.52)),
        line((0.7, 0.52), (0.7, 0.64)),
        line((0.2, 0.46), (0.2, 0.88), (0.8, 0.88), (0.8, 0.46)),
        line((0.12, 0.5), (0.5, 0.13), (0.88, 0.5)),
        line((0.66, 0.29), (0.66, 0.16), (0.74, 0.16), (0.74, 0.37)),
    ],
    'cat': [
        line((0.06, 0.58), (0.32, 0.63)),
        mirror(line((0.06, 0.58), (0.32, 0.63))),
        line((0.05, 0.69), (0.32, 0.68)),
        mirror(line((0.05, 0.69), (0.32, 0.68))),
        line((0.08, 0.8), (0.32, 0.73)),
        mirror(line((0.08, 0.8), (0.32, 0.73))),
        line((0.47, 0.61), (0.53, 0.61), (0.5, 0.65), (0.47, 0.61)),
        join(curve((0.42, 0.7), (0.47, 0.74), (0.5, 0.65)), curve((0.5, 0.65), (0.53, 0.74), (0.58, 0.7))),
        circle(0.38, 0.5, 0.03, -90, 16),
        circle(0.62, 0.5, 0.03, -90, 16),
        join(
            line((0.2, 0.52), (0.22, 0.14), (0.4, 0.3)),
            curve((0.4, 0.3), (0.5, 0.27), (0.6, 0.3)),
            line((0.6, 0.3), (0.78, 0.14), (0.8, 0.52)),
            curve((0.8, 0.52), (0.82, 0.9), (0.5, 0.9)),
            curve((0.5, 0.9), (0.18, 0.9), (0.2, 0.52)),
        ),
    ],
    'car': [
        circle(0.28, 0.72, 0.09),
        circle(0.72, 0.72, 0.09),
        line((0.19, 0.72), (0.08, 0.72), (0.08, 0.56), (0.25, 0.5), (0.35, 0.32), (0.65, 0.32), (0.75, 0.5), (0.92, 0.56), (0.92, 0.72), (0.81, 0.72)),
        line((0.37, 0.72), (0.63, 0.72)),
        line((0.38, 0.37), (0.48, 0.37), (0.48, 0.5), (0.31, 0.5), (0.38, 0.37)),
        line((0.53, 0.37), (0.63, 0.37), (0.7, 0.5), (0.53, 0.5), (0.53, 0.37)),
    ],
    'star': [pentagram(0.5, 0.54, 0.42), *rays(0.86, 0.14, 0.02, 0.07, 4, -45)],
    'sun': [
        *rays(0.5, 0.5, 0.31, 0.44, 8),
        circle(0.5, 0.5, 0.23, -90, 40),
        circle(0.42, 0.45, 0.025, -90, 12),
        circle(0.58, 0.45, 0.025, -90, 12),
        arc(0.5, 0.53, 0.1, 0.08, 20, 160, 14),
    ],
    'umbrella': [
        join(line((0.5, 0.45), (0.5, 0.82)), arc(0.43, 0.82, 0.07, 0.07, 0, 180, 16)),
        arc(0.5, 0.45, 0.4, 0.33, 180, 360, 36),
        join(*(arc(cx, 0.45, 0.0667, 0.05, 0, -180, 10) for cx in (0.8333, 0.7, 0.5667, 0.4333, 0.3, 0.1667))),
        line((0.5, 0.12), (0.5, 0.05)),
    ],
    'clock': [
        line((0.5, 0.5), (0.5, 0.24)),
        line((0.5, 0.5), (0.68, 0.6)),
        circle(0.5, 0.5, 0.025, -90, 12),
        line((0.5, 0.14), (0.5, 0.2)),
        line((0.86, 0.5), (0.8, 0.5)),
        line((0.5, 0.86), (0.5, 0.8)),
        line((0.14, 0.5), (0.2, 0.5)),
        circle(0.5, 0.5, 0.4, -90, 48),
        line((0.3, 0.846), (0.23, 0.94)),
        line((0.7, 0.846), (0.77, 0.94)),
    ],
}


def render_doodle_card(name: str, size: int, angle: float) -> Image.Image:
    """A quiz drawing on the game's graph-paper board (comic-card paper-bg), tilted by `angle` degrees."""
    S = size * SS
    border = S * 0.022
    img = Image.new('RGBA', (S, S))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.1, fill=INK)
    inner = Image.new('RGBA', (S, S))
    di = ImageDraw.Draw(inner)
    di.rectangle((0, 0, S, S), fill=WHITE)
    cell = S / 11
    for i in range(1, 11):
        di.line((i * cell, 0, i * cell, S), fill=PAPER_GRID, width=max(1, round(S / 300)))
        di.line((0, i * cell, S, i * cell), fill=PAPER_GRID, width=max(1, round(S / 300)))
    mask = Image.new('L', (S, S))
    ImageDraw.Draw(mask).rounded_rectangle((border, border, S - border, S - border), radius=S * 0.1 - border, fill=255)
    img.paste(inner, (0, 0), mask)

    margin = S * 0.1
    p = Painter(img, S - 2 * margin, margin, margin)
    for stroke in DOODLES[name]:
        p.polyline(stroke, INK, 0.028)

    img = downsample(img)
    shadow = max(2, round(size * 0.025))
    img = drop_shadow(img, shadow, shadow)
    return img.rotate(angle, resample=Image.BICUBIC, expand=True)


# ---------------------------------------------------------------------------------------------
# Typography pieces
# ---------------------------------------------------------------------------------------------
def render_logo(size: int) -> Image.Image:
    """The title in the game's .logo-3d style: white fill, ink outline, ink/red/ink extrusion, tilted -4°."""
    font = jp_font(size)
    stroke = max(2, round(size * 0.05))
    depth = round(size * 10 / 60)
    l, t, r, b = font.getbbox(TITLE, stroke_width=stroke)
    pad = stroke + 4
    img = Image.new('RGBA', (r - l + depth + 2 * pad, b - t + depth + 2 * pad))
    d = ImageDraw.Draw(img)
    x, y = pad - l, pad - t
    for i in range(depth, 0, -1):
        f = i / depth  # CSS layers 1–4 ink, 5–8 red, 9–10 ink
        color = RED if 0.4 < f <= 0.8 else INK
        d.text((x + i, y + i), TITLE, font=font, fill=color, stroke_width=stroke, stroke_fill=color)
    d.text((x, y), TITLE, font=font, fill=WHITE, stroke_width=stroke, stroke_fill=INK)
    return img.rotate(4, resample=Image.BICUBIC, expand=True)


def render_badge(size: int) -> Image.Image:
    """The sky-blue "REAL-TIME SKETCH QUIZ" tag above the title."""
    font = jp_font(size)
    l, t, r, b = font.getbbox(BADGE)
    px, py, bw = round(size * 0.6), round(size * 0.3), max(2, round(size * 0.18))
    w, h = r - l + 2 * px, b - t + 2 * py
    img = Image.new('RGBA', (w, h))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=size * 0.5, fill=SKY, outline=INK, width=bw)
    d.text((px - l, py - t), BADGE, font=font, fill=INK)
    sh = max(2, round(size * 0.18))
    return drop_shadow(img, sh, sh).rotate(2, resample=Image.BICUBIC, expand=True)


def draw_rich_text(img: Image.Image, xy: tuple[int, int], text: str, font: ImageFont.FreeTypeFont, fill=INK) -> None:
    """Text with color emoji mixed in (Pillow can't fall back between fonts on its own)."""
    x, y = xy
    d = ImageDraw.Draw(img)
    ascent, descent = font.getmetrics()
    for ch in text:
        if is_emoji(ch):
            tile = render_emoji(ch, round(font.size * 0.95))
            if tile:
                img.alpha_composite(tile, (round(x + font.size * 0.08), round(y + (ascent + descent - tile.height) / 2)))
                x += tile.width + font.size * 0.16
            continue
        d.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch)


def rich_text_size(text: str, font: ImageFont.FreeTypeFont) -> tuple[int, int]:
    w = 0.0
    for ch in text:
        if is_emoji(ch):
            tile = render_emoji(ch, round(font.size * 0.95))
            w += tile.width + font.size * 0.16 if tile else 0
        else:
            w += font.getlength(ch)
    ascent, descent = font.getmetrics()
    return round(w), ascent + descent


def render_bubble(text: str, size: int, tail: str = 'right') -> Image.Image:
    """comic-card speech bubble (white, 4px ink border, hard shadow) with a tail pointing at Buster-kun."""
    font = jp_font(size)
    tw, th = rich_text_size(text, font)
    px, py = round(size * 0.7), round(size * 0.45)
    bw = max(3, round(size * 0.11))
    tail_len = round(size * 0.9)
    w, h = tw + 2 * px, th + 2 * py
    img = Image.new('RGBA', ((w + tail_len) * SS, h * SS))
    d = ImageDraw.Draw(img)
    k = SS
    body = (0, 0, w * k - 1, h * k - 1)
    tip = ((w + tail_len) * k, h * k * 0.3)
    base = [(w * k - bw * k * 2, h * k * 0.32), (w * k - bw * k * 2, h * k * 0.72)]
    # outline pass then fill pass, so the tail merges into the body
    d.rounded_rectangle(body, radius=size * 0.55 * k, fill=INK)
    d.polygon([base[0], tip, base[1]], fill=INK)
    inset = bw * k
    d.rounded_rectangle((inset, inset, w * k - 1 - inset, h * k - 1 - inset), radius=(size * 0.55 - bw) * k, fill=WHITE)
    # tail interior: same triangle pulled in by the border width
    d.polygon([(base[0][0], base[0][1] + inset * 1.2), (tip[0] - inset * 2.6, tip[1] + inset * 0.2), (base[1][0], base[1][1] - inset * 1.6)], fill=WHITE)
    img = downsample(img)
    if tail == 'left':
        img = img.transpose(Image.FLIP_LEFT_RIGHT)
        draw_rich_text(img, (px + tail_len, py), text, font)
    else:
        draw_rich_text(img, (px, py), text, font)
    sh = max(3, round(size * 0.12))
    return drop_shadow(img, sh, sh)


# ---------------------------------------------------------------------------------------------
# Backgrounds / layout
# ---------------------------------------------------------------------------------------------
def graph_paper(w: int, h: int, cell: int, bg=BEIGE, minor=GRID_MINOR, major=GRID_MAJOR, every: int = 5) -> Image.Image:
    img = Image.new('RGBA', (w, h), bg)
    d = ImageDraw.Draw(img)
    thin, thick = max(1, cell // 22), max(2, cell // 11)
    for i, x in enumerate(range(0, w + 1, cell)):
        d.line((x, 0, x, h), fill=major if i % every == 0 else minor, width=thick if i % every == 0 else thin)
    for i, y in enumerate(range(0, h + 1, cell)):
        d.line((0, y, w, y), fill=major if i % every == 0 else minor, width=thick if i % every == 0 else thin)
    return img


def compose_hero(max_w: int, max_h: int) -> Image.Image:
    """Badge + logo on the left, catch-copy bubble under it, Buster-kun on the right — scaled to fit."""

    def build(k: float) -> tuple[Image.Image, dict]:
        badge = render_badge(round(28 * k))
        logo = render_logo(round(100 * k))
        bubble = render_bubble(CATCH, round(40 * k))
        mascot = render_mascot(round(400 * k), 'wink')
        gap = round(24 * k)
        col_w = max(logo.width, bubble.width + round(60 * k))
        logo_y = badge.height - round(12 * k)
        bubble_y = logo_y + logo.height + gap
        w = col_w + gap + mascot.width
        h = max(bubble_y + bubble.height, mascot.height)
        img = Image.new('RGBA', (w, h))
        img.alpha_composite(badge, (round(24 * k), 0))
        img.alpha_composite(logo, (0, logo_y))
        img.alpha_composite(mascot, (col_w + gap, h - mascot.height))
        bubble_x = col_w + gap - bubble.width + round(30 * k)  # tail tucks in toward the mascot
        img.alpha_composite(bubble, (bubble_x, bubble_y))
        return img, {'bubble_x': bubble_x, 'bubble_y': bubble_y}

    probe, _ = build(1.0)
    k = min(max_w / probe.width, max_h / probe.height)
    img, _ = build(k)
    return img


# ---------------------------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------------------------
def make_icon(size: int = 1024) -> Image.Image:
    img = graph_paper(size, size, size // 16, minor='#ebe0bf', major='#e2d3a6')
    mascot = render_mascot(round(size * 0.64), 'normal', 'head')
    img.alpha_composite(mascot, ((size - mascot.width) // 2, (size - mascot.height) // 2 + round(size * 0.02)))
    # Border ring on the inscribed circle, so it survives the circular crop X/YouTube/TikTok apply.
    ring = Image.new('RGBA', (size * SS, size * SS))
    rw = size * 0.022 * SS
    ImageDraw.Draw(ring).ellipse((rw / 2, rw / 2, size * SS - rw / 2, size * SS - rw / 2), outline=INK, width=round(rw))
    img.alpha_composite(downsample(ring))
    return img.convert('RGB')


def make_x_header(w: int = 1500, h: int = 500) -> Image.Image:
    img = graph_paper(w, h, 25)
    # The profile icon covers roughly x < 430, y > 300 on desktop: keep the hero right of it.
    # The logo sits up top, so it can reach further left than the bubble below it.
    hero = compose_hero(1180, h - 60)
    img.alpha_composite(hero, (w - 50 - hero.width, (h - hero.height) // 2))
    return img.convert('RGB')


def make_youtube_banner(w: int = 2048, h: int = 1152) -> Image.Image:
    img = graph_paper(w, h, 32)
    safe_w, safe_h = 1546, 423
    sx, sy = (w - safe_w) // 2, (h - safe_h) // 2

    # Doodle cards around the safe area (only TVs / wide desktops show them).
    names = list(DOODLES)
    slots = [
        # top band
        (170, 185, -8), (590, 175, 6), (1024, 190, -4), (1458, 170, 7), (1878, 185, -6),
        # bottom band
        (170, 965, 6), (590, 975, -7), (1024, 960, 5), (1458, 980, -5), (1878, 965, 8),
        # sides
        (118, 576, 5), (1930, 576, -6),
    ]
    for i, (cx, cy, angle) in enumerate(slots):
        size = 190 if cy == 576 else 230
        card = render_doodle_card(names[i % len(names)], size, angle)
        img.alpha_composite(card, (cx - card.width // 2, cy - card.height // 2))

    hero = compose_hero(safe_w - 40, safe_h - 10)
    img.alpha_composite(hero, (sx + (safe_w - hero.width) // 2, sy + (safe_h - hero.height) // 2))
    return img.convert('RGB')


def main() -> None:
    global _font_override
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', type=Path, default=ROOT / 'sns_assets', help='output directory (default: sns_assets/)')
    ap.add_argument('--font', help='Japanese font file to use instead of the auto-detected one')
    args = ap.parse_args()
    _font_override = args.font

    args.out.mkdir(parents=True, exist_ok=True)
    for name, make in (('icon_buster.png', make_icon), ('header_x.png', make_x_header), ('header_youtube.png', make_youtube_banner)):
        path = args.out / name
        img = make()
        img.save(path, optimize=True)
        print(f'wrote {path} ({img.width}x{img.height})')


if __name__ == '__main__':
    main()

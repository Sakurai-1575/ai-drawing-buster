/**
 * Steam store capsule art, rendered from the game's own design language (cream dot paper,
 * comic 3D logo, sketch cards, pencil, Buster-kun) straight onto canvases at exact pixel sizes.
 * Dev-only tool — see CapsuleGenerator (and scripts/generate_steam_assets.py, which drives it).
 *
 * Steam capsule rules: game art + the game's name only — no taglines, quotes, scores or feature text.
 * "Up to 8 players" is therefore shown as art (8 player-colored buzzer lamps), not written.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PENCIL } from '../art/pencil';
import { PAD_RATIO, buildPath, drawPartial } from '../art/strokePath';
import { MascotCharacter } from '../components/MascotCharacter';
import { QUIZZES, type Quiz } from '../data/quizzes';
import type { MascotExpression } from '../mascotLines';

type Ctx = CanvasRenderingContext2D;

export type CapsuleGroup = 'store' | 'library' | 'icon';

export interface CapsuleSpec {
  id: string;
  group: CapsuleGroup;
  label: string;
  width: number;
  height: number;
  /** Steam requirement shown under the preview. */
  note?: string;
  /** Output format; defaults to PNG. */
  format?: 'png' | 'jpeg';
  render: (ctx: Ctx) => void;
}

const INK = '#0f172a';
const ROSE = '#e11d48';
const YELLOW = '#fcd34d';
const SKY = '#7dd3fc';
const BUBBLE = '#bae6fd';

// ---------------------------------------------------------------- languages
// Steam store art is localized per language: the logo, the chip under it and the font. The art itself
// (sketch cards, Buster-kun, lamps) is language-independent. Titles: ja/zh are the game's own UI titles
// (src/i18n/strings/ja.ts, zh-CN.ts); en is "AI Quick Draw Buster" (the game's English title too, src/i18n/strings/en.ts).

export type CapsuleLang = 'ja' | 'en' | 'zh';

interface Copy {
  line1: string;
  line2: string;
  /** Between the two lines when they are set on one row. */
  join: string;
  chip: string;
  font: string;
}

const COPY: Record<CapsuleLang, Copy> = {
  ja: {
    line1: 'AIお絵描き',
    line2: 'バスター',
    join: '',
    chip: 'AI Quick Draw Buster',
    font: '"Hiragino Maru Gothic ProN", "BIZ UDPGothic", "Yu Gothic UI", Meiryo, system-ui, sans-serif',
  },
  en: {
    line1: 'AI Quick Draw',
    line2: 'Buster',
    join: ' ',
    chip: 'REAL-TIME SKETCH QUIZ',
    font: '"Segoe UI Black", "Arial Black", "Hiragino Maru Gothic ProN", "BIZ UDPGothic", system-ui, sans-serif',
  },
  zh: {
    line1: 'AI涂鸦',
    line2: '大破解',
    join: '',
    chip: 'REAL-TIME SKETCH QUIZ',
    font: '"Yuanti SC", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "Noto Sans CJK SC", system-ui, sans-serif',
  },
};

let capsuleLang: CapsuleLang = 'ja';
/** Choose the language the next renderCapsule calls draw in (default ja). */
export function setCapsuleLang(lang: CapsuleLang): void {
  capsuleLang = lang;
}
const copy = () => COPY[capsuleLang];

/** The online seats' colors, in join order (multiplayer/shared.tsx PLAYER_COLORS, Tailwind *-300). */
const PLAYER_HEX = ['#fda4af', '#7dd3fc', '#6ee7b7', '#fcd34d', '#c4b5fd', '#fdba74', '#bef264', '#f9a8d4'];

const deg = (d: number) => (d * Math.PI) / 180;
const quiz = (id: string): Quiz => QUIZZES.find((q) => q.id === id) ?? QUIZZES[0];
const font = (size: number) => `900 ${size}px ${copy().font}`;

// ---------------------------------------------------------------- primitives

function background(ctx: Ctx, w: number, h: number, burstX = w / 2, burstY = h / 2) {
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(0, 0, w, h);

  // Soft sunburst behind the logo.
  const r = Math.hypot(w, h);
  const rays = 28;
  ctx.save();
  ctx.translate(burstX, burstY);
  ctx.fillStyle = 'rgba(251, 191, 36, 0.18)';
  ctx.beginPath();
  for (let i = 0; i < rays; i++) {
    const a0 = (i / rays) * Math.PI * 2;
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a0, a0 + Math.PI / rays);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();

  // The in-game dot grid (2px dots every 28px at 720p), scaled to the capsule.
  const s = Math.max(0.5, Math.min(w, h) / 720);
  const step = 28 * s;
  const dot = 2 * s;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
  ctx.beginPath();
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      ctx.moveTo(x + dot, y);
      ctx.arc(x, y, dot, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

interface Seg {
  text: string;
  fill: string;
}

/**
 * One line of the comic logo: white fill, thick ink outline and a stacked extrusion
 * (ink → rose → ink), matching the title screen's `.logo-3d`. Shrinks to fit `maxWidth`.
 */
function logoLine(ctx: Ctx, segs: Seg[], cx: number, cy: number, size: number, maxWidth: number) {
  ctx.font = font(size);
  const measure = () => segs.reduce((w, s) => w + ctx.measureText(s.text).width, 0);
  let width = measure();
  if (width > maxWidth) {
    size *= maxWidth / width;
    ctx.font = font(size);
    width = measure();
  }
  const outline = size * 0.085;
  const depth = Math.max(2, Math.round(size * 0.12));
  const x0 = cx - width / 2;

  ctx.save();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = outline * 2;

  const paint = (dx: number, fillOf: (s: Seg) => string, withStroke: boolean, strokeColor = INK) => {
    let x = x0 + dx;
    for (const seg of segs) {
      if (withStroke) {
        ctx.strokeStyle = strokeColor;
        ctx.strokeText(seg.text, x, cy + dx);
      }
      ctx.fillStyle = fillOf(seg);
      ctx.fillText(seg.text, x, cy + dx);
      x += ctx.measureText(seg.text).width;
    }
  };

  // Extrusion, back to front.
  for (let d = depth; d >= 1; d--) {
    const f = d / depth;
    const color = f > 0.8 ? INK : f > 0.4 ? ROSE : INK;
    paint(d, () => color, true, color);
  }
  // Face.
  paint(0, () => INK, true);
  paint(0, (s) => s.fill, false);
  ctx.restore();
}

function chip(ctx: Ctx, text: string, cx: number, cy: number, size: number, bg: string, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  ctx.font = font(size);
  const w = ctx.measureText(text).width + size * 1.1;
  const h = size * 1.55;
  const r = size * 0.35;
  const shadow = Math.max(2, size * 0.16);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + shadow, -h / 2 + shadow, w, h, r);
  ctx.fill();
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.13);
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.04);
  ctx.restore();
}

/** Pencil icon with its graphite tip at (x, y); `size` is the icon's box size in px. */
function pencil(ctx: Ctx, x: number, y: number, size: number, rot = 0) {
  const k = size / PENCIL.size;
  const parts: [string, string][] = [
    [PENCIL.body, PENCIL.bodyFill],
    [PENCIL.eraser, PENCIL.eraserFill],
    [PENCIL.wood, PENCIL.woodFill],
  ];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(deg(rot));
  ctx.scale(k, k);
  ctx.translate(-PENCIL.tip[0], -PENCIL.tip[1]);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  // Hard comic drop shadow.
  ctx.save();
  ctx.translate(2.5, 2.5);
  ctx.fillStyle = INK;
  for (const [d] of parts) {
    const p = new Path2D(d);
    ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.restore();
  for (const [d, fill] of parts) {
    const p = new Path2D(d);
    ctx.fillStyle = fill;
    ctx.fill(p);
    ctx.stroke(p);
  }
  ctx.fillStyle = INK;
  ctx.fill(new Path2D(PENCIL.graphite));
  ctx.restore();
}

interface CardOptions {
  cx: number;
  cy: number;
  size: number;
  rot: number;
  quiz: Quiz;
  progress: number;
  withPencil?: boolean;
  /** Line width as a fraction of the card size (default 0.02). Icons use a heavier line to survive downscaling. */
  lineRatio?: number;
  grid?: boolean;
}

/** The in-game sketch canvas: graph paper card with a (partially) drawn quiz and the pencil on the line. */
function sketchCard(ctx: Ctx, { cx, cy, size, rot, quiz: q, progress, withPencil, lineRatio = 0.02, grid = true }: CardOptions) {
  const half = size / 2;
  const radius = size * 0.07;
  const shadow = Math.max(3, size * 0.022);
  const pad = size * PAD_RATIO;
  const inner = size - pad * 2;
  const toPx = ([x, y]: readonly [number, number]): [number, number] => [-half + pad + x * inner, -half + pad + y * inner];

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-half + shadow, -half + shadow, size, size, radius);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, radius);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Graph paper.
  ctx.save();
  if (!grid) ctx.globalAlpha = 0;
  ctx.clip();
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = Math.max(1, size / 440);
  const step = size / 20;
  ctx.beginPath();
  for (let v = -half + step; v < half; v += step) {
    ctx.moveTo(v, -half);
    ctx.lineTo(v, half);
    ctx.moveTo(-half, v);
    ctx.lineTo(half, v);
  }
  ctx.stroke();
  ctx.restore();

  const path = buildPath(q.strokes);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = size * lineRatio;
  const tip = drawPartial(ctx, path, path.total * progress, toPx);

  ctx.beginPath();
  ctx.roundRect(-half, -half, size, size, radius);
  ctx.lineWidth = Math.max(3, size * 0.014);
  ctx.strokeStyle = INK;
  ctx.stroke();

  if (withPencil && tip) {
    const [tx, ty] = toPx(tip);
    pencil(ctx, tx, ty, size * 0.3);
  }
  ctx.restore();
}

function bubble(ctx: Ctx, text: string, cx: number, cy: number, size: number, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  ctx.font = font(size);
  const w = ctx.measureText(text).width + size * 1.2;
  const h = size * 1.9;
  const border = Math.max(3, size * 0.13);
  const shadow = Math.max(3, size * 0.15);
  const tail = size * 0.55;
  const shape = (dx: number) => {
    ctx.beginPath();
    ctx.roundRect(-w / 2 + dx, -h / 2 + dx, w, h, size * 0.45);
    // Tail pointing down-right, like the in-game bubble.
    ctx.moveTo(w * 0.18 + dx, h / 2 - 1 + dx);
    ctx.lineTo(w * 0.3 + dx, h / 2 + tail + dx);
    ctx.lineTo(w * 0.34 + dx, h / 2 - 1 + dx);
  };
  ctx.fillStyle = INK;
  shape(shadow);
  ctx.fill();
  ctx.fillStyle = BUBBLE;
  shape(0);
  ctx.fill();
  ctx.lineWidth = border;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  // Hide the seam between body and tail.
  ctx.fillStyle = BUBBLE;
  ctx.fillRect(w * 0.18 + border / 2, h / 2 - border * 1.5, w * 0.16 - border, border * 2);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.05);
  ctx.restore();
}

/** A bold outlined glyph ("?" / "!") used as comic punctuation around the art. */
function mark(ctx: Ctx, glyph: string, cx: number, cy: number, size: number, fill: string, rot: number) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  logoLine(ctx, [{ text: glyph, fill }], 0, 0, size, Infinity);
  ctx.restore();
}

/** Four-point comic sparkle. */
function sparkle(ctx: Ctx, cx: number, cy: number, r: number, fill = '#fff') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.32 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.16);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** Wax crayon: paper wrapper with stripes, flat end, and a cone tip pointing along +x. */
function crayon(ctx: Ctx, cx: number, cy: number, length: number, rot: number, color: string) {
  const w = length * 0.17;
  const body = length * 0.78;
  const tip = length - body;
  const lw = Math.max(3, length * 0.018);
  const x0 = -length / 2;
  const shape = () => {
    ctx.beginPath();
    ctx.roundRect(x0, -w / 2, body, w, w * 0.18);
    ctx.moveTo(x0 + body - 1, -w * 0.38);
    ctx.lineTo(x0 + body + tip * 0.85, -w * 0.1);
    ctx.quadraticCurveTo(x0 + length, 0, x0 + body + tip * 0.85, w * 0.1);
    ctx.lineTo(x0 + body - 1, w * 0.38);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;

  ctx.save();
  ctx.translate(lw * 1.6, lw * 1.6);
  ctx.fillStyle = INK;
  shape();
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = color;
  shape();
  ctx.fill();
  // Paper wrapper band with a darker stripe pair.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(x0 + body * 0.22, -w / 2, body * 0.56, w);
  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  ctx.fillRect(x0 + body * 0.3, -w / 2, body * 0.035, w);
  ctx.fillRect(x0 + body * 0.66, -w / 2, body * 0.035, w);
  shape();
  ctx.stroke();
  ctx.restore();
}

/** A torn-off notebook page: ruled lines, red margin, punched holes, and a doodle scribble. */
function notebook(ctx: Ctx, cx: number, cy: number, w: number, h: number, rot: number, scribble: string) {
  const r = Math.min(w, h) * 0.05;
  const lw = Math.max(3, Math.min(w, h) * 0.018);
  const shadow = lw * 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + shadow, -h / 2 + shadow, w, h, r);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = '#fffdf5';
  ctx.fill();

  ctx.save();
  ctx.clip();
  const gap = h / 7;
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = Math.max(1.5, lw * 0.45);
  ctx.beginPath();
  for (let y = -h / 2 + gap * 1.2; y < h / 2; y += gap) {
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y);
  }
  ctx.stroke();
  const margin = -w / 2 + w * 0.14;
  ctx.strokeStyle = '#fb7185';
  ctx.beginPath();
  ctx.moveTo(margin, -h / 2);
  ctx.lineTo(margin, h / 2);
  ctx.stroke();
  ctx.fillStyle = '#fef3c7';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(-w / 2 + w * 0.065, -h / 2 + (h * (i + 1)) / 4, lw * 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Doodle in the page body.
  squiggle(ctx, margin + w * 0.08, 0, w * 0.68, h * 0.28, scribble, lw * 1.1, 3);
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
}

/** Loopy hand-drawn scribble from (x, y) spanning `w`, `waves` loops. */
function squiggle(ctx: Ctx, x: number, y: number, w: number, amp: number, color: string, lw: number, waves: number) {
  ctx.save();
  ctx.beginPath();
  const steps = 90;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * waves;
    const px = x + t * w + Math.cos(a) * amp * 0.35;
    const py = y + Math.sin(a) * amp * 0.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function titleBlock(ctx: Ctx, cx: number, y1: number, y2: number, s1: number, s2: number, maxWidth: number, rot: number) {
  ctx.save();
  ctx.translate(cx, (y1 + y2) / 2);
  ctx.rotate(deg(rot));
  const mid = (y1 + y2) / 2;
  logoLine(ctx, [{ text: copy().line1, fill: '#fff' }], 0, y1 - mid, s1, maxWidth);
  logoLine(ctx, [{ text: copy().line2, fill: YELLOW }], 0, y2 - mid, s2, maxWidth);
  ctx.restore();
}

// ---------------------------------------------------------------- Buster-kun

type MascotVariant = 'full' | 'head';
const mascotArt = new Map<string, HTMLImageElement>();
/** Padding around the SVG's viewBox so the tail, pencil and outline aren't clipped when rasterized. */
const MASCOT_PAD = 8;

/**
 * Rasterizes the game's own MascotCharacter (the same SVG as in-game) for the expressions the layouts
 * use. Must be awaited before rendering; layouts skip Buster-kun if an image isn't ready.
 */
export async function loadCapsuleArt(): Promise<void> {
  const wanted: [MascotExpression, MascotVariant][] = [
    ['wink', 'full'],
    ['smug', 'full'],
    ['panic', 'full'],
    ['laugh', 'full'],
    ['wink', 'head'],
  ];
  await Promise.all(
    wanted.map(async ([expression, variant]) => {
      const key = `${expression}/${variant}`;
      if (mascotArt.has(key)) return;
      let svg = renderToStaticMarkup(createElement(MascotCharacter, { expression, variant, animated: false, size: 1000 }));
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      // Pad the viewBox, and give the image an intrinsic size with exactly that aspect (16 px per unit).
      let box = [0, 0, 0, 0];
      svg = svg.replace(/viewBox="([\d.-]+) ([\d.-]+) ([\d.-]+) ([\d.-]+)"/, (_, x, y, w, h) => {
        box = [+x - MASCOT_PAD, +y - MASCOT_PAD, +w + MASCOT_PAD * 2, +h + MASCOT_PAD * 2];
        return `viewBox="${box.join(' ')}"`;
      });
      svg = svg.replace(/ width="[\d.]+"/, ` width="${box[2] * 16}"`).replace(/ height="[\d.]+"/, ` height="${box[3] * 16}"`);
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      mascotArt.set(key, img);
    }),
  );
}

/** Buster-kun centered on (cx, cy), `height` px tall, with the in-game ink drop shadow. */
function mascot(ctx: Ctx, expression: MascotExpression, cx: number, cy: number, height: number, rot = 0, variant: MascotVariant = 'full') {
  const img = mascotArt.get(`${expression}/${variant}`);
  if (!img) return;
  const [vw, vh] = variant === 'head' ? [112, 98] : [120, 132];
  const h = height * ((vh + MASCOT_PAD * 2) / vh);
  const w = h * ((vw + MASCOT_PAD * 2) / (vh + MASCOT_PAD * 2));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  ctx.shadowColor = INK;
  ctx.shadowOffsetX = height * 0.024;
  ctx.shadowOffsetY = height * 0.024;
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** A row of 8 buzzer lamps in the online players' colors — "up to 8 players", said with art. */
function playerLamps(ctx: Ctx, cx: number, cy: number, r: number, gap: number, rot = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(deg(rot));
  const x0 = -((PLAYER_HEX.length - 1) * gap) / 2;
  PLAYER_HEX.forEach((color, i) => {
    const x = x0 + i * gap;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x + r * 0.2, r * 0.2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.3, -r * 0.35, r * 0.32, r * 0.2, deg(-30), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// ---------------------------------------------------------------- layouts

function mainCapsule(ctx: Ctx) {
  const w = 1232;
  const h = 706;
  background(ctx, w, h, w / 2, 250);

  sketchCard(ctx, { cx: 150, cy: 610, size: 230, rot: -10, quiz: quiz('cat'), progress: 1 });
  sketchCard(ctx, { cx: 1112, cy: 606, size: 230, rot: 9, quiz: quiz('airplane'), progress: 1 });
  sketchCard(ctx, { cx: 440, cy: 588, size: 290, rot: -3, quiz: quiz('icecream'), progress: 0.62, withPencil: true });
  mascot(ctx, 'wink', 790, 588, 330, 3);

  ctx.save();
  ctx.translate(w / 2, 235);
  ctx.rotate(deg(-4));
  logoLine(
    ctx,
    [
      { text: copy().line1 + copy().join, fill: '#fff' },
      { text: copy().line2, fill: YELLOW },
    ],
    0,
    0,
    150,
    980,
  );
  ctx.restore();
  chip(ctx, copy().chip, w / 2, 385, 40, SKY, 2);

  mark(ctx, '?', 72, 130, 110, '#fff', -14);
  mark(ctx, '!', 1168, 120, 110, YELLOW, 12);
  sparkle(ctx, 200, 395, 26, YELLOW);
  sparkle(ctx, 1040, 395, 22);
  sparkle(ctx, 1150, 300, 16, YELLOW);
}

function headerCapsule(ctx: Ctx) {
  const w = 920;
  const h = 430;
  background(ctx, w, h, 610, 190);

  sketchCard(ctx, { cx: 175, cy: 222, size: 280, rot: -6, quiz: quiz('icecream'), progress: 0.65, withPencil: true });
  mascot(ctx, 'smug', 332, 330, 190, 4);
  bubble(ctx, '？？？', 130, 62, 26, -5);

  titleBlock(ctx, 640, 130, 245, 100, 120, 470, -4);
  chip(ctx, copy().chip, 640, 360, 30, SKY, 2);

  sparkle(ctx, 395, 385, 18, YELLOW);
  sparkle(ctx, 885, 330, 14);
  sparkle(ctx, 880, 40, 16, YELLOW);
}

function smallCapsule(ctx: Ctx) {
  const w = 462;
  const h = 174;
  background(ctx, w, h);

  titleBlock(ctx, 214, 52, 120, 60, 74, 330, -2);
  mascot(ctx, 'wink', 418, 116, 92, 6, 'head');
}

function verticalCapsule(ctx: Ctx) {
  const w = 748;
  const h = 896;
  background(ctx, w, h, w / 2, 230);

  titleBlock(ctx, w / 2, 145, 285, 124, 156, 660, -4);
  chip(ctx, copy().chip, w / 2, 425, 36, SKY, 2);

  playerLamps(ctx, w / 2, 490, 17, 50, -2);
  sketchCard(ctx, { cx: 300, cy: 690, size: 340, rot: -4, quiz: quiz('cat'), progress: 0.72, withPencil: true });
  mascot(ctx, 'wink', 575, 735, 300, 5);
  bubble(ctx, '？？？', 600, 560, 30, 6);

  mark(ctx, '!', 90, 845, 80, YELLOW, -12);
  sparkle(ctx, 70, 460, 22, YELLOW);
  sparkle(ctx, 690, 420, 18);
  sparkle(ctx, 660, 850, 24, YELLOW);
}

function libraryCapsule(ctx: Ctx) {
  const w = 600;
  const h = 900;
  background(ctx, w, h, w / 2, 220);

  titleBlock(ctx, w / 2, 145, 265, 104, 132, 530, -4);
  chip(ctx, copy().chip, w / 2, 385, 28, SKY, 2);

  playerLamps(ctx, w / 2, 452, 13, 40, -2);
  sketchCard(ctx, { cx: 230, cy: 650, size: 300, rot: -4, quiz: quiz('icecream'), progress: 0.65, withPencil: true });
  mascot(ctx, 'smug', 455, 720, 270, 5);
  bubble(ctx, '？？？', 470, 540, 24, 6);
  crayon(ctx, 150, 860, 170, -20, '#fb7185');
  sparkle(ctx, 60, 420, 18, YELLOW);
  sparkle(ctx, 555, 360, 14);
  sparkle(ctx, 70, 840, 20, YELLOW);
}

/** 3840×1240 hero: art only, no text (Steam overlays the logo). Key art sits in the center 860×380 safe area. */
function libraryHero(ctx: Ctx) {
  const w = 3840;
  const h = 1240;
  background(ctx, w, h, w / 2, h / 2);

  // Outer ring: loose props scattered toward the edges (these crop away on narrow windows).
  notebook(ctx, 330, 980, 560, 300, 6, '#38bdf8');
  notebook(ctx, 1180, 170, 520, 260, -5, '#fb7185');
  notebook(ctx, 2760, 1080, 560, 280, -4, '#34d399');
  notebook(ctx, 3560, 190, 520, 280, 7, '#f59e0b');

  sketchCard(ctx, { cx: 360, cy: 360, size: 400, rot: -9, quiz: quiz('apple'), progress: 1 });
  sketchCard(ctx, { cx: 3480, cy: 800, size: 420, rot: 8, quiz: quiz('umbrella'), progress: 1 });
  sketchCard(ctx, { cx: 960, cy: 760, size: 330, rot: 7, quiz: quiz('fish'), progress: 1 });
  sketchCard(ctx, { cx: 2900, cy: 420, size: 340, rot: -6, quiz: quiz('car'), progress: 1 });

  crayon(ctx, 780, 190, 360, 18, '#fcd34d');
  crayon(ctx, 1520, 1080, 380, -14, '#38bdf8');
  crayon(ctx, 2330, 150, 360, 168, '#34d399');
  crayon(ctx, 3130, 1120, 340, 196, '#a78bfa');
  crayon(ctx, 3780, 520, 300, 100, '#fb923c');
  pencil(ctx, 1880, 1150, 200, -20);
  pencil(ctx, 60, 140, 170, 10);

  squiggle(ctx, 1320, 470, 260, 90, '#fb7185', 9, 4);
  squiggle(ctx, 2380, 880, 280, 90, '#38bdf8', 9, 4);
  squiggle(ctx, 2020, 90, 240, 70, '#f59e0b', 8, 3);

  // Center safe area (1490–2350 × 430–810): Buster-kun at his sketch — everything that matters is in here.
  sketchCard(ctx, { cx: 1745, cy: 622, size: 300, rot: -4, quiz: quiz('cat'), progress: 0.72, withPencil: true });
  mascot(ctx, 'wink', 2130, 622, 350, 3);
  // Outside it: the 8 online seats as buzzer lamps.
  playerLamps(ctx, w / 2, 900, 26, 76, -1);

  const sparkles: [number, number, number, string][] = [
    [1545, 452, 26, YELLOW],
    [2320, 470, 22, '#fff'],
    [1430, 820, 22, '#fff'],
    [2420, 800, 24, YELLOW],
    [640, 600, 26, YELLOW],
    [3180, 700, 28, '#fff'],
    [1700, 180, 22, '#fff'],
    [2600, 700, 20, YELLOW],
    [120, 700, 24, '#fff'],
    [3740, 1050, 26, YELLOW],
  ];
  for (const [x, y, r, c] of sparkles) sparkle(ctx, x, y, r, c);
}

/**
 * 1438×810 store page background: no text, low contrast — Steam's page content sits on top. A dim
 * retro-PC grid with faint sketches from the quizzes, fading to Steam's navy toward the edges.
 */
function pageBackground(ctx: Ctx) {
  const w = 1438;
  const h = 810;
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#1c2b44');
  base.addColorStop(1, '#16223a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Graph-paper grid, like the in-game canvas but inverted and dim.
  ctx.strokeStyle = 'rgba(148, 197, 253, 0.07)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0.5; x < w; x += 24) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0.5; y < h; y += 24) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(148, 197, 253, 0.1)';
  ctx.beginPath();
  for (let x = 0.5; x < w; x += 120) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = 0.5; y < h; y += 120) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // Ghost sketches (the quiz strokes, as chalk), kept toward the sides where store content is thinner.
  const ghosts: [string, number, number, number, number][] = [
    ['cat', 150, 170, 240, -8],
    ['icecream', 1290, 150, 220, 7],
    ['airplane', 120, 610, 230, 6],
    ['apple', 1310, 620, 210, -6],
    ['umbrella', 470, 90, 150, 5],
    ['fish', 980, 730, 170, -4],
  ];
  for (const [id, cx, cy, size, rot] of ghosts) {
    const path = buildPath(quiz(id).strokes);
    const pad = size * PAD_RATIO;
    const inner = size - pad * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(deg(rot));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.085)';
    ctx.lineWidth = size * 0.022;
    drawPartial(ctx, path, path.total, ([x, y]) => [-size / 2 + pad + x * inner, -size / 2 + pad + y * inner]);
    ctx.restore();
  }

  // Scanlines, then fade every edge into Steam's page navy.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.06)';
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  const vignette = ctx.createRadialGradient(w / 2, h * 0.42, h * 0.25, w / 2, h / 2, w * 0.62);
  vignette.addColorStop(0, 'rgba(27, 40, 56, 0)');
  vignette.addColorStop(1, 'rgba(27, 40, 56, 0.92)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
  const bottom = ctx.createLinearGradient(0, h * 0.7, 0, h);
  bottom.addColorStop(0, 'rgba(27, 40, 56, 0)');
  bottom.addColorStop(1, 'rgba(27, 40, 56, 1)');
  ctx.fillStyle = bottom;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

/** 1280×720 transparent logo (overlaid on the hero). */
function libraryLogo(ctx: Ctx) {
  const w = 1280;
  titleBlock(ctx, w / 2, 250, 430, 170, 214, 1140, -4);
  chip(ctx, copy().chip, w / 2, 590, 44, SKY, 2);
  sparkle(ctx, 110, 150, 34, YELLOW);
  sparkle(ctx, 1180, 520, 28, '#fff');
}

/** Square game icon, authored on a 512 grid. Fully opaque (JPEG has no alpha, and Steam blackens transparency). */
function iconArt(ctx: Ctx) {
  const n = 512;
  background(ctx, n, n, n / 2, n / 2);
  // Heavy comic frame inset from the edge; the corners outside it stay cream, never transparent.
  ctx.beginPath();
  ctx.roundRect(14, 14, n - 28, n - 28, 64);
  ctx.lineWidth = 18;
  ctx.strokeStyle = INK;
  ctx.stroke();

  sketchCard(ctx, { cx: 250, cy: 262, size: 350, rot: -5, quiz: quiz('cat'), progress: 1, lineRatio: 0.038, grid: false });
  pencil(ctx, 330, 380, 170);
  sparkle(ctx, 420, 98, 30, YELLOW);
}

function iconAt(size: number) {
  return (ctx: Ctx) => {
    // Re-render the vector art at the target size instead of resampling a bitmap: sharper edges at 184px.
    ctx.scale(size / 512, size / 512);
    iconArt(ctx);
  };
}

export const CAPSULES: CapsuleSpec[] = [
  { id: 'main_capsule', group: 'store', label: 'メインカプセル / Main Capsule', width: 1232, height: 706, render: mainCapsule },
  { id: 'header_capsule', group: 'store', label: 'ヘッダーカプセル / Header Capsule', width: 920, height: 430, render: headerCapsule },
  { id: 'small_capsule', group: 'store', label: '小型カプセル / Small Capsule', width: 462, height: 174, render: smallCapsule },
  { id: 'vertical_capsule', group: 'store', label: '垂直カプセル / Vertical Capsule', width: 748, height: 896, render: verticalCapsule },
  {
    id: 'page_background',
    group: 'store',
    label: 'ストア背景 / Page Background',
    width: 1438,
    height: 810,
    note: '文字なし・低コントラスト。端はSteamの紺に馴染ませる',
    render: pageBackground,
  },
  { id: 'library_capsule', group: 'library', label: 'ライブラリカプセル / Library Capsule', width: 600, height: 900, render: libraryCapsule },
  {
    id: 'library_header',
    group: 'library',
    label: 'ライブラリヘッダー / Library Header',
    width: 920,
    height: 430,
    note: 'ストアのヘッダーカプセルと同じデザイン',
    render: headerCapsule,
  },
  {
    id: 'library_hero',
    group: 'library',
    label: 'ライブラリヒーロー / Library Hero',
    width: 3840,
    height: 1240,
    note: 'テキスト・ロゴなし。点線枠は中央 860×380 のセーフエリア（プレビューのみ）',
    render: libraryHero,
  },
  {
    id: 'library_logo',
    group: 'library',
    label: 'ライブラリロゴ / Library Logo',
    width: 1280,
    height: 720,
    note: '背景は完全透過（市松模様が透けて見えれば OK）',
    render: libraryLogo,
  },
  {
    id: 'shortcut_icon',
    group: 'icon',
    label: 'ショートカットアイコン / Shortcut Icon',
    width: 512,
    height: 512,
    note: 'PNG・背景は塗りつぶし（透過なし）',
    render: iconAt(512),
  },
  {
    id: 'app_icon',
    group: 'icon',
    label: 'アプリアイコン / App Icon',
    width: 184,
    height: 184,
    format: 'jpeg',
    note: 'JPG（品質 0.95）',
    render: iconAt(184),
  },
];

export const HERO_SAFE_AREA = { width: 860, height: 380 };

export function renderCapsule(canvas: HTMLCanvasElement, spec: CapsuleSpec) {
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Start fully transparent; opaque assets paint their own background.
  ctx.clearRect(0, 0, spec.width, spec.height);
  ctx.imageSmoothingQuality = 'high';
  spec.render(ctx);
}

export const JPEG_QUALITY = 0.95;

export function capsuleMime(spec: CapsuleSpec) {
  return spec.format === 'jpeg' ? 'image/jpeg' : 'image/png';
}

export function capsuleFilename(spec: CapsuleSpec) {
  return `steam_${spec.id}_${spec.width}x${spec.height}.${spec.format === 'jpeg' ? 'jpg' : 'png'}`;
}


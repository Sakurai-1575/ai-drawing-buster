import { useEffect, useRef, type PointerEvent } from 'react';
import { PEN_COLORS, PEN_WIDTHS, STROKE_SCALE } from '../net/protocol';
import type { SketchStroke } from './useMatch';

/** Ignore pointer moves shorter than this (normalized) — keeps chunks small without visible loss. */
const MIN_STEP = 0.003;

interface Props {
  strokes: SketchStroke[];
  /** Displayed size in stage (design) pixels. */
  size: number;
  /** Stage scale factor, so the backing store stays crisp at any window size. */
  scale: number;
  /** When set, the pad accepts mouse/touch/pen drawing. */
  input?: {
    color: number;
    width: number;
    onBegin: (color: number, width: number, x: number, y: number) => boolean;
    onMove: (x: number, y: number) => void;
    onEnd: () => void;
  };
}

/** Mode B shared canvas: renders synced strokes, and captures the drawer's pen input (normalized 0–1 coords). */
export function SketchPad({ strokes, size, scale, input }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const px = Math.max(1, Math.round(size * scale * (window.devicePixelRatio || 1)));
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    const k = px / STROKE_SCALE;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of strokes) {
      const p = s.p;
      if (p.length < 2) continue;
      ctx.strokeStyle = PEN_COLORS[s.c] ?? PEN_COLORS[0];
      ctx.fillStyle = ctx.strokeStyle;
      ctx.lineWidth = (PEN_WIDTHS[s.w] ?? PEN_WIDTHS[1]) * px;
      if (p.length === 2) {
        ctx.beginPath();
        ctx.arc(p[0] * k, p[1] * k, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      // Smooth with quadratic curves through segment midpoints.
      ctx.beginPath();
      ctx.moveTo(p[0] * k, p[1] * k);
      for (let i = 2; i < p.length - 2; i += 2) {
        const mx = ((p[i] + p[i + 2]) / 2) * k;
        const my = ((p[i + 1] + p[i + 3]) / 2) * k;
        ctx.quadraticCurveTo(p[i] * k, p[i + 1] * k, mx, my);
      }
      ctx.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
      ctx.stroke();
    }
  }, [strokes, size, scale]);

  const toNorm = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };

  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!input || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const [x, y] = toNorm(e);
    if (!input.onBegin(input.color, input.width, x, y)) return;
    drawing.current = true;
    last.current = [x, y];
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!input || !drawing.current) return;
    // Coalesced events give every sample the hardware reported, not just one per frame.
    const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of events.length ? events : [e.nativeEvent]) {
      const [x, y] = toNorm(ev);
      if (Math.hypot(x - last.current[0], y - last.current[1]) < MIN_STEP) continue;
      last.current = [x, y];
      input.onMove(x, y);
    }
  };

  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    input?.onEnd();
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, touchAction: 'none' }}
      className={`block ${input ? 'cursor-crosshair' : ''}`}
      // Stroke/point totals, for sync checks in tests and debugging.
      data-strokes={strokes.length}
      data-points={strokes.reduce((n, s) => n + s.p.length / 2, 0)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
    />
  );
}

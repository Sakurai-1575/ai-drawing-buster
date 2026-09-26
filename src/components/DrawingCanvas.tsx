import { useEffect, useMemo, useRef } from 'react';
import type { Stroke } from '../data/quizzes';
import { PENCIL } from '../art/pencil';
import { PAD_RATIO, buildPath, drawPartial } from '../art/strokePath';

interface Props {
  strokes: Stroke[];
  /** 0–1: fraction of the total stroke length to draw. */
  progress: number;
  /** Displayed size in stage (design) pixels. */
  size: number;
  /** Stage scale factor, so the backing store stays crisp at any window size. */
  scale: number;
  showPencil: boolean;
}

export function DrawingCanvas({ strokes, progress, size, scale, showPencil }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const path = useMemo(() => buildPath(strokes), [strokes]);
  const length = path.total * Math.min(1, Math.max(0, progress));
  const pad = size * PAD_RATIO;
  const inner = size - pad * 2;

  const tip = useMemo(() => drawPartial(null, path, length, () => [0, 0]), [path, length]);

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
    const k = px / size;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = size * 0.017;
    drawPartial(ctx, path, length, ([x, y]) => [pad + x * inner, pad + y * inner]);
  }, [path, length, size, scale, pad, inner]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      {showPencil && tip && (
        <div
          className="pointer-events-none absolute"
          style={{ left: pad + tip[0] * inner, top: pad + tip[1] * inner, transform: 'translate(-5px, -49px)' }}
        >
          <Pencil />
        </div>
      )}
    </div>
  );
}

function Pencil() {
  return (
    <svg width="54" height="54" viewBox="0 0 54 54" className="animate-wiggle origin-bottom-left drop-shadow-[2px_2px_0_#0f172a]">
      <g stroke="#0f172a" strokeWidth="3" strokeLinejoin="round">
        <path d={PENCIL.body} fill={PENCIL.bodyFill} />
        <path d={PENCIL.eraser} fill={PENCIL.eraserFill} />
        <path d={PENCIL.wood} fill={PENCIL.woodFill} />
      </g>
      <path d={PENCIL.graphite} fill="#0f172a" />
    </svg>
  );
}

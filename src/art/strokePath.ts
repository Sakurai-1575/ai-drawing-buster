import type { Point, Stroke } from '../data/quizzes';

/**
 * Arc-length timeline for a drawing, shared by the in-game canvas and the Steam capsule generator.
 *
 * Progress is measured in normalized path length, so the pen moves at one constant speed.
 * That includes the pen-up hop between strokes: the pencil glides to the next stroke's start
 * at the same speed instead of teleporting (a teleport reads as a sudden burst of speed).
 */
export interface PathData {
  strokes: Stroke[];
  /** Cumulative length at each point, per stroke (ink). */
  starts: number[][];
  /** Cumulative length where the pen lifts off to travel to stroke `s` (equals starts[s][0] for the first stroke). */
  lifts: number[];
  total: number;
}

/** Inset of the drawing inside its square canvas, as a fraction of the side. */
export const PAD_RATIO = 0.06;

const dist = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function buildPath(strokes: Stroke[]): PathData {
  let total = 0;
  let prevEnd: Point | null = null;
  const lifts: number[] = [];
  const starts = strokes.map((stroke) => {
    lifts.push(total);
    if (prevEnd && stroke.length) total += dist(prevEnd, stroke[0]);
    const cumulative = stroke.map((p, i) => {
      if (i > 0) total += dist(stroke[i - 1], p);
      return total;
    });
    if (stroke.length) prevEnd = stroke[stroke.length - 1];
    return cumulative;
  });
  return { strokes, starts, lifts, total };
}

/** Draws the path up to `length` and returns the pen-tip position (normalized). */
export function drawPartial(ctx: CanvasRenderingContext2D | null, path: PathData, length: number, toPx: (p: Point) => [number, number]): Point | null {
  let tip: Point | null = null;
  ctx?.beginPath();
  for (let s = 0; s < path.strokes.length; s++) {
    const stroke = path.strokes[s];
    const starts = path.starts[s];
    if (!stroke.length) continue;
    if (starts[0] > length) {
      // Pen is in the air between strokes: glide from the previous stroke's end.
      const from = path.strokes[s - 1]?.[path.strokes[s - 1].length - 1];
      const lift = path.lifts[s];
      if (from && length > lift) {
        const t = (length - lift) / (starts[0] - lift);
        tip = [from[0] + (stroke[0][0] - from[0]) * t, from[1] + (stroke[0][1] - from[1]) * t];
      }
      break;
    }
    ctx?.moveTo(...toPx(stroke[0]));
    tip = stroke[0];
    for (let i = 1; i < stroke.length; i++) {
      const segStart = starts[i - 1];
      const segEnd = starts[i];
      const [x0, y0] = stroke[i - 1];
      const [x1, y1] = stroke[i];
      if (segEnd <= length) {
        ctx?.lineTo(...toPx(stroke[i]));
        tip = stroke[i];
      } else {
        const t = segEnd > segStart ? (length - segStart) / (segEnd - segStart) : 0;
        tip = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
        ctx?.lineTo(...toPx(tip));
        break;
      }
    }
    if (starts[starts.length - 1] > length) break;
  }
  ctx?.stroke();
  return tip;
}


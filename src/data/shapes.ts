/**
 * Shape helpers for the quiz line drawings. Coordinates are normalized to 0.0–1.0
 * (x → right, y → down); every helper returns a Stroke (a polyline drawn in order).
 */

export type Point = [x: number, y: number];
export type Stroke = Point[];

const round = (n: number) => Math.round(n * 1000) / 1000;
export const pt = (x: number, y: number): Point => [round(x), round(y)];
export const rad = (deg: number) => (deg * Math.PI) / 180;

/** Straight polyline through the given points. */
export function line(...pts: Point[]): Stroke {
  return pts.map(([x, y]) => pt(x, y));
}

/** Elliptical arc. Angles in degrees: 0° = right, 90° = down. */
export function arc(cx: number, cy: number, rx: number, ry: number, fromDeg: number, toDeg: number, steps = 28): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(fromDeg + ((toDeg - fromDeg) * i) / steps);
    pts.push(pt(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return pts;
}

export function circle(cx: number, cy: number, r: number, startDeg = -90, steps = 36): Stroke {
  return arc(cx, cy, r, r, startDeg, startDeg + 360, steps);
}

/** Quadratic Bézier from p0 to p1 with control point c. */
export function curve(p0: Point, c: Point, p1: Point, steps = 16): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    pts.push(pt(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]));
  }
  return pts;
}

/** Concatenate strokes into one continuous stroke. */
export function join(...parts: Stroke[]): Stroke {
  return parts.flatMap((part, i) => (i === 0 ? part : part.slice(1)));
}

/** Mirror a stroke horizontally around x = 0.5. */
export function mirror(stroke: Stroke): Stroke {
  return stroke.map(([x, y]) => pt(1 - x, y));
}

export function wave(x0: number, x1: number, y: number, amp: number, cycles: number, steps = 48): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(pt(x0 + (x1 - x0) * t, y + amp * Math.sin(t * cycles * Math.PI * 2)));
  }
  return pts;
}

/** Radial line segments (sun rays, sparkles). */
export function rays(cx: number, cy: number, r0: number, r1: number, count: number, offsetDeg = -90): Stroke[] {
  return Array.from({ length: count }, (_, i) => {
    const a = rad(offsetDeg + (360 / count) * i);
    return line([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)], [cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]);
  });
}

/** One-stroke pentagram, starting bottom-left so the first lines look like a mountain. */
export function pentagram(cx: number, cy: number, r: number): Stroke {
  const outer = (k: number): Point => {
    const a = rad(-90 + 72 * k);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  return line(...[3, 0, 2, 4, 1, 3].map(outer));
}

/** Full ellipse starting at `startDeg`. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, startDeg = -90, steps = 40): Stroke {
  return arc(cx, cy, rx, ry, startDeg, startDeg + 360, steps);
}

/** Archimedean spiral from the center outward (snail shells, candy swirls). */
export function spiral(cx: number, cy: number, r0: number, r1: number, turns: number, startDeg = 0, steps = 90): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = rad(startDeg + 360 * turns * t);
    const r = r0 + (r1 - r0) * t;
    pts.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/** Closed scalloped outline (clouds, tree crowns, wool, icing): `bumps` puffs that bulge out by `depth`. */
export function bumpy(cx: number, cy: number, rx: number, ry: number, bumps: number, depth: number, steps = 120): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 - Math.PI / 2;
    const k = 1 + depth * Math.abs(Math.sin((bumps * a) / 2));
    pts.push(pt(cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)));
  }
  return pts;
}

/** Heart-shaped leaf in local space: tip at the origin, lobes pointing up (-y). Use with `place`. */
export function heartLeaf(size = 0.18): Stroke {
  const k = size / 0.2;
  const p = (x: number, y: number): Point => [x * k, y * k];
  // Taller than wide, so four leaves at 90° sit side by side instead of piling up.
  return join(
    curve(p(0, 0), p(-0.15, -0.07), p(-0.12, -0.2)),
    curve(p(-0.12, -0.2), p(-0.08, -0.29), p(0, -0.21)),
    curve(p(0, -0.21), p(0.08, -0.29), p(0.12, -0.2)),
    curve(p(0.12, -0.2), p(0.15, -0.07), p(0, 0)),
  );
}

/** Rotate a local-space stroke by `deg` (clockwise on screen) and move its origin to (cx, cy). */
export function place(stroke: Stroke, cx: number, cy: number, deg: number): Stroke {
  const a = rad(deg);
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return stroke.map(([x, y]) => pt(cx + x * c - y * sn, cy + x * sn + y * c));
}

/** Coil that narrows from y0 to y1 (tornadoes, springs): `turns` flat loops, width rx0 → rx1. */
export function coil(cx: number, y0: number, y1: number, rx0: number, rx1: number, ry: number, turns: number, steps = 150): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * turns * Math.PI * 2;
    const rx = rx0 + (rx1 - rx0) * t;
    pts.push(pt(cx + 0.04 * Math.sin(t * Math.PI * 1.5) + rx * Math.cos(a), y0 + (y1 - y0) * t + ry * (rx / rx0) * Math.sin(a)));
  }
  return pts;
}

/** Notched cosmos petal in local space: base at the origin, pointing up (-y). Use with `place`. */
export function cosmosPetal(): Stroke {
  return join(
    curve([0, 0], [-0.1, -0.08], [-0.07, -0.22]),
    line([-0.07, -0.22], [-0.035, -0.2], [0, -0.23], [0.035, -0.2], [0.07, -0.22]),
    curve([0.07, -0.22], [0.1, -0.08], [0, 0]),
  );
}

/** Closed axis-aligned rectangle, drawn clockwise from the top-left corner. */
export function rect(x0: number, y0: number, x1: number, y1: number): Stroke {
  return line([x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]);
}

/** Closed polyline through the given points. */
export function closed(...pts: Point[]): Stroke {
  return line(...pts, pts[0]);
}

/** Zigzag along an arc, alternating between radii r0 and r1 (spines, manes, jagged edges). */
export function zigzagArc(cx: number, cy: number, r0: number, r1: number, fromDeg: number, toDeg: number, teeth: number): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= teeth * 2; i++) {
    const a = rad(fromDeg + ((toDeg - fromDeg) * i) / (teeth * 2));
    const r = i % 2 ? r1 : r0;
    pts.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/** Closed shape with `count` rounded arms/lobes between radii r0 (valleys) and r1 (tips) — starfish, flowers, splats. */
export function lobed(cx: number, cy: number, r0: number, r1: number, count: number, startDeg = -90, steps = 150): Stroke {
  const pts: Stroke = [];
  for (let i = 0; i <= steps; i++) {
    const a = rad(startDeg + (360 * i) / steps);
    const k = (Math.cos(count * (a - rad(startDeg))) + 1) / 2;
    const r = r0 + (r1 - r0) * Math.pow(k, 1.6);
    pts.push(pt(cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  return pts;
}

/** Closed rectangle with rounded corners (radius r), clockwise from the top edge. */
export function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): Stroke {
  return join(
    line([x0 + r, y0], [x1 - r, y0]),
    arc(x1 - r, y0 + r, r, r, -90, 0, 6),
    line([x1, y0 + r], [x1, y1 - r]),
    arc(x1 - r, y1 - r, r, r, 0, 90, 6),
    line([x1 - r, y1], [x0 + r, y1]),
    arc(x0 + r, y1 - r, r, r, 90, 180, 6),
    line([x0, y1 - r], [x0, y0 + r]),
    arc(x0 + r, y0 + r, r, r, 180, 270, 6),
  );
}


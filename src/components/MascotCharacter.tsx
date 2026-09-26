import type { MascotExpression } from '../mascotLines';
import { PENCIL } from '../art/pencil';

const INK = '#0f172a';
const SHELL = '#fde68a';
const SCREEN = '#1e293b';
const GLOW = '#5eead4';

interface Props {
  expression: MascotExpression;
  /** Rendered width in px (height follows the viewBox). */
  size?: number;
  /** 'head' draws just the CRT face and ears — for small icons like reaction stamps. */
  variant?: 'full' | 'head';
  /** Idle/laugh/tremble motion (off for static icons). */
  animated?: boolean;
  className?: string;
}

const MOTION: Record<MascotExpression, string> = {
  normal: 'animate-mascot-idle',
  smug: 'animate-mascot-idle',
  laugh: 'animate-mascot-laugh',
  panic: 'animate-mascot-tremble',
  shock: 'animate-mascot-shock',
  wink: 'animate-mascot-idle',
  angry: 'animate-mascot-huff',
  sleepy: 'animate-mascot-doze',
};

/**
 * "Buster-kun": a doodle robot cat with a retro CRT-monitor head, clutching a pencil.
 * Pure inline SVG — the face is drawn on the screen in phosphor green and swaps per expression.
 */
export function MascotCharacter({ expression, size = 160, variant = 'full', animated = true, className = '' }: Props) {
  const motion = animated ? MOTION[expression] : '';
  const head = variant === 'head';
  const [vw, vh] = head ? [112, 98] : [120, 132];
  return (
    <svg
      viewBox={head ? '4 2 112 98' : '0 0 120 132'}
      width={size}
      height={(size * vh) / vw}
      className={`${motion} overflow-visible drop-shadow-[3px_3px_0_#0f172a] ${className}`}
      role="img"
      aria-label="Buster-kun"
    >
      <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
        {!head && (
          <>
            {/* tail */}
            <path d="M36 112 C18 116 10 104 16 94 C20 88 28 92 24 98" fill="none" />
            {/* body + stand */}
            <path d="M40 94 H80 L86 118 H34 Z" fill={SHELL} />
            <path d="M28 118 H92 V126 H28 Z" fill="#fb7185" />
          </>
        )}
        {/* ears */}
        <path d="M20 32 L28 6 L48 24 Z" fill={SHELL} />
        <path d="M100 32 L92 6 L72 24 Z" fill={SHELL} />
        <path d="M27 24 L30 14 L38 22 Z" fill="#fda4af" strokeWidth="2" />
        <path d="M93 24 L90 14 L82 22 Z" fill="#fda4af" strokeWidth="2" />
        {/* CRT head */}
        <rect x="10" y="20" width="100" height="76" rx="16" fill={SHELL} />
        <rect x="20" y="29" width="80" height="54" rx="11" fill={SCREEN} />
        {/* bezel knobs */}
        <circle cx="86" cy="89.5" r="2.6" fill="#fb7185" strokeWidth="2" />
        <circle cx="96" cy="89.5" r="2.6" fill={GLOW} strokeWidth="2" />
      </g>

      {/* screen glare + scanlines */}
      <path d="M26 36 Q30 32 40 32" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" fill="none" />
      <g stroke={GLOW} strokeOpacity="0.08" strokeWidth="1.5">
        {[40, 48, 56, 64, 72].map((y) => (
          <line key={y} x1="22" y1={y} x2="98" y2={y} />
        ))}
      </g>

      <Face expression={expression} />

      {!head && (
        <>
          {/* paw clutching a pencil in front of the body (tip down-left, ready to draw) */}
          <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
            <path d="M82 104 Q90 110 96 110" fill="none" />
          </g>
          <g transform="translate(82.6 90.7) scale(0.68)" stroke={INK} strokeWidth="4.5" strokeLinejoin="round">
            <path d={PENCIL.body} fill={PENCIL.bodyFill} />
            <path d={PENCIL.eraser} fill={PENCIL.eraserFill} />
            <path d={PENCIL.wood} fill={PENCIL.woodFill} />
            <path d={PENCIL.graphite} fill={INK} stroke="none" />
          </g>
          <g stroke={INK} strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round">
            <circle cx="100" cy="108" r="7.5" fill={SHELL} />
            <path d="M97 104 v4 M101 103 v4" strokeWidth="2" />
          </g>
        </>
      )}

      {expression === 'panic' && <Sweat />}
      {expression === 'shock' && <ShockLines />}
      {expression === 'wink' && <Sparkle />}
      {expression === 'angry' && <AngerMark />}
      {expression === 'sleepy' && <Zzz />}
    </svg>
  );
}

function Face({ expression }: { expression: MascotExpression }) {
  const common = { stroke: GLOW, strokeWidth: 3.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  switch (expression) {
    case 'normal':
      return (
        <g {...common}>
          <g className="animate-mascot-blink" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <ellipse cx="46" cy="52" rx="5" ry="6.5" fill={GLOW} stroke="none" />
            <ellipse cx="74" cy="52" rx="5" ry="6.5" fill={GLOW} stroke="none" />
          </g>
          {/* ω mouth + whiskers */}
          <path d="M52 66 q4 5 8 0 q4 5 8 0" />
          <path d="M30 63 h9 M31 69 l8 -3 M90 63 h-9 M89 69 l-8 -3" strokeWidth="2" />
        </g>
      );
    case 'smug':
      return (
        <g {...common}>
          {/* half-lidded eyes */}
          <path d="M39 51 h14" />
          <path d="M40.5 51.5 a5.5 4.5 0 0 0 11 0 z" fill={GLOW} stroke="none" />
          <path d="M67 51 h14" />
          <path d="M68.5 51.5 a5.5 4.5 0 0 0 11 0 z" fill={GLOW} stroke="none" />
          {/* one raised brow */}
          <path d="M40 42 l12 3" strokeWidth="2.5" />
          <path d="M68 44 l12 -4" strokeWidth="2.5" />
          {/* smirk */}
          <path d="M50 68 q10 4 20 -5" />
          <path d="M30 63 h9 M90 63 h-9" strokeWidth="2" />
        </g>
      );
    case 'laugh':
      return (
        <g {...common}>
          {/* > < squeezed eyes */}
          <path d="M40 46 l9 5 l-9 5" />
          <path d="M80 46 l-9 5 l9 5" />
          {/* wide-open laughing mouth */}
          <path d="M46 61 h28 q-2 16 -14 16 q-12 0 -14 -16 z" fill={GLOW} stroke={GLOW} />
          <path d="M53 72 q7 -4 14 0" stroke="#fb7185" strokeWidth="3.5" />
          {/* tears */}
          <path d="M36 58 q-3 5 0 7" stroke="#7dd3fc" strokeWidth="2.5" />
          <path d="M84 58 q3 5 0 7" stroke="#7dd3fc" strokeWidth="2.5" />
        </g>
      );
    case 'panic':
      return (
        <g {...common} strokeWidth={2.4}>
          {/* @@ swirl eyes */}
          <path d="M46 52 m0 -1.2 a1.2 1.2 0 1 1 -1.2 1.2 a3 3 0 1 1 3 3 a5 5 0 1 1 5 -5" />
          <path d="M74 52 m0 -1.2 a1.2 1.2 0 1 1 -1.2 1.2 a3 3 0 1 1 3 3 a5 5 0 1 1 5 -5" />
          {/* wobbly mouth */}
          <path d="M46 70 q3.5 -5 7 0 t7 0 t7 0 t7 0" strokeWidth="3" />
        </g>
      );
    case 'shock':
      return (
        <g {...common}>
          {/* tiny dot eyes in wide-open rings */}
          <circle cx="46" cy="50" r="7" strokeWidth="2.4" />
          <circle cx="74" cy="50" r="7" strokeWidth="2.4" />
          <circle cx="46" cy="50" r="1.8" fill={GLOW} stroke="none" />
          <circle cx="74" cy="50" r="1.8" fill={GLOW} stroke="none" />
          {/* jaw hanging open */}
          <ellipse cx="60" cy="70" rx="6.5" ry="8" fill={GLOW} stroke="none" />
          <ellipse cx="60" cy="73" rx="3.5" ry="3" fill="#fb7185" stroke="none" />
        </g>
      );
    case 'wink':
      return (
        <g {...common}>
          {/* open eye + ^ winking eye */}
          <ellipse cx="46" cy="52" rx="5" ry="6.5" fill={GLOW} stroke="none" />
          <path d="M67 54 q7 -8 14 0" />
          {/* confident grin with a fang */}
          <path d="M48 64 q12 10 24 0" />
          <path d="M53 66.5 l2 4 l2 -3" strokeWidth="2" />
          <path d="M30 63 h9 M31 69 l8 -3 M90 63 h-9 M89 69 l-8 -3" strokeWidth="2" />
        </g>
      );
    case 'angry':
      return (
        <g {...common}>
          {/* slanted brows over squinting eyes */}
          <path d="M38 42 l14 6" strokeWidth="2.8" />
          <path d="M82 42 l-14 6" strokeWidth="2.8" />
          <path d="M41 53 q5 -4 10 0" />
          <path d="M69 53 q5 -4 10 0" />
          {/* puffed-out cheeks and a pursed mouth */}
          <g className="animate-mascot-puff" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
            <circle cx="34" cy="66" r="7" fill="#fb7185" fillOpacity="0.55" stroke="none" />
            <circle cx="86" cy="66" r="7" fill="#fb7185" fillOpacity="0.55" stroke="none" />
          </g>
          <path d="M55 70 q5 -5 10 0 q-5 5 -10 0 z" fill={GLOW} strokeWidth="2" />
        </g>
      );
    case 'sleepy':
      return (
        <g {...common}>
          {/* closed, droopy eyes */}
          <path d="M39 53 q7 5 14 0" />
          <path d="M67 53 q7 5 14 0" />
          {/* slack mouth + a drool drop */}
          <path d="M54 67 q6 3 12 0" />
          <path d="M65 68 q2 4 0 6 q-2 -2 0 -6 z" fill="#7dd3fc" stroke="#7dd3fc" strokeWidth="1.5" />
        </g>
      );
  }
}

/** Frozen-in-shock jolt lines around the head. */
function ShockLines() {
  return (
    <g stroke={INK} strokeWidth="3" strokeLinecap="round">
      <path d="M4 20 l8 6 M2 46 h9 M116 20 l-8 6 M118 46 h-9 M60 -6 v8" />
    </g>
  );
}

/** Twinkling star beside the winking eye. */
function Sparkle() {
  return (
    <g className="animate-mascot-twinkle" style={{ transformBox: 'fill-box', transformOrigin: 'center' }}>
      <path d="M110 8 l3 7 l7 3 l-7 3 l-3 7 l-3 -7 l-7 -3 l7 -3 z" fill="#fde047" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

/** Manga anger mark on the corner of the head. */
function AngerMark() {
  return (
    <g
      className="animate-mascot-puff"
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
      stroke="#e11d48"
      strokeWidth="3"
      strokeLinecap="round"
      fill="none"
    >
      <path d="M102 8 q3 5 8 5 M112 6 q-5 3 -5 8 M104 18 q5 -3 5 -8 M114 16 q-3 -5 -8 -5" />
    </g>
  );
}

/** Drifting "Z z z" while dozing off. */
function Zzz() {
  return (
    <g className="animate-mascot-zzz" fill={INK} fontWeight="900" fontFamily="system-ui, sans-serif">
      <text x="90" y="18" fontSize="16">
        Z
      </text>
      <text x="102" y="7" fontSize="11">
        z
      </text>
      <text x="110" y="-2" fontSize="8">
        z
      </text>
    </g>
  );
}

function Sweat() {
  return (
    <g className="animate-mascot-sweat" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" fill="#7dd3fc">
      <path d="M108 14 q6 10 0 13 q-6 -3 0 -13 z" />
      <path d="M8 36 q5 8 0 10.5 q-5 -2.5 0 -10.5 z" />
      <path d="M113 40 q4 7 0 9 q-4 -2 0 -9 z" />
    </g>
  );
}

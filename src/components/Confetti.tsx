import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const COLORS = ['#fb7185', '#38bdf8', '#fcd34d', '#34d399', '#a78bfa', '#fb923c'];
const COUNT = 90;
const LIFETIME_MS = 2600;

/** One-shot confetti burst, re-triggered whenever `burst` changes (0 = none). */
export function Confetti({ burst }: { burst: number }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!burst) return;
    setActive(burst);
    const timer = window.setTimeout(() => setActive(0), LIFETIME_MS);
    return () => window.clearTimeout(timer);
  }, [burst]);

  const pieces = useMemo(
    () =>
      active
        ? Array.from({ length: COUNT }, (_, i) => {
            const round = Math.random() < 0.3;
            const w = 8 + Math.random() * 10;
            return {
              round,
              style: {
                '--dx': `${(Math.random() - 0.5) * 320}px`,
                '--spin': `${(Math.random() - 0.5) * 1440}deg`,
                '--dur': `${1.3 + Math.random() * 0.9}s`,
                '--delay': `${Math.random() * 0.25}s`,
                left: `${Math.random() * 100}%`,
                top: -20 - Math.random() * 80,
                width: w,
                height: round ? w : 10 + Math.random() * 14,
                borderRadius: round ? '9999px' : '2px',
                backgroundColor: COLORS[i % COLORS.length],
              } as CSSProperties,
            };
          })
        : [],
    [active],
  );

  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={`${active}-${i}`} className="confetti-piece absolute border-2 border-slate-900" style={p.style} />
      ))}
    </div>
  );
}

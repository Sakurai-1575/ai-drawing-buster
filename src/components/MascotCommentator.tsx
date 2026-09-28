import { useEffect, useRef, useState } from 'react';
import type { Lang } from '../data/quizzes';
import type { MascotEvent } from '../hooks/useMascot';
import { fmt } from '../i18n';
import { MASCOT_EXPRESSION, MASCOT_LINES, type MascotExpression, type MascotLineKind } from '../mascotLines';
import { MascotCharacter } from './MascotCharacter';

/** How long a line stays up before fading (the fade itself adds ~300ms). */
const SHOW_MS = 2_200;

interface Props {
  /** Latest game event (from useMascot). A new `id` pops a new line. */
  event: MascotEvent | null;
  lang: Lang;
  /** Mascot width in px. */
  size?: number;
  /** Balloon slot height; reserved even when empty so nothing around it shifts. */
  balloonHeight?: number;
  className?: string;
}

interface Line {
  id: number;
  text: string;
  expression: MascotExpression;
}

/** Buster-kun plus his speech balloon: pops a random line per event, then fades back to idle. */
export function MascotCommentator({ event, lang, size = 150, balloonHeight = 104, className = '' }: Props) {
  const [line, setLine] = useState<Line | null>(null);
  const [visible, setVisible] = useState(false);
  const lastPick = useRef<Partial<Record<MascotLineKind, number>>>({});
  const langRef = useRef(lang);
  langRef.current = lang;

  useEffect(() => {
    if (!event) return;
    const pool = MASCOT_LINES[langRef.current][event.kind];
    let i = Math.floor(Math.random() * pool.length);
    // Never say the same thing twice in a row.
    if (pool.length > 1 && i === lastPick.current[event.kind]) i = (i + 1) % pool.length;
    lastPick.current[event.kind] = i;
    setLine({ id: event.id, text: fmt(pool[i], event.vars ?? {}), expression: MASCOT_EXPRESSION[event.kind] });
    setVisible(true);
    const hide = window.setTimeout(() => setVisible(false), SHOW_MS);
    return () => window.clearTimeout(hide);
  }, [event]);

  const expression: MascotExpression = visible && line ? line.expression : 'normal';

  return (
    <div className={`pointer-events-none flex flex-col items-center ${className}`}>
      <div className="relative flex w-full items-end justify-center" style={{ height: balloonHeight }}>
        {line && (
          <div
            key={line.id}
            aria-live="polite"
            className={`animate-balloon-pop relative mb-4 max-w-full rounded-2xl border-4 border-slate-900 bg-sky-200 px-4 py-2 text-center text-xl font-black leading-snug text-slate-900 shadow-[4px_4px_0_#0f172a] transition-opacity duration-300 ${
              visible ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {line.text}
            <span className="absolute -bottom-[14px] left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 border-b-4 border-r-4 border-slate-900 bg-sky-200" />
          </div>
        )}
      </div>
      <MascotCharacter expression={expression} size={size} />
    </div>
  );
}


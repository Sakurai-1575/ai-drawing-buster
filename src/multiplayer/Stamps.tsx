import { useEffect, useRef, useState } from 'react';
import { MascotCharacter } from '../components/MascotCharacter';
import type { Dict } from '../i18n';
import type { MascotExpression } from '../mascotLines';
import { STAMP_COOLDOWN_MS, STAMP_KINDS, type PlayerInfo, type StampKind } from '../net/protocol';
import { STAMP_LIFETIME_MS, type FlyingStamp } from './useMatch';

/** Each stamp is a Buster-kun face plus an emoji badge. */
export const STAMP_STYLE: Record<StampKind, { expression: MascotExpression; emoji: string; bg: string }> = {
  clap: { expression: 'normal', emoji: '👏', bg: 'bg-amber-200' },
  lol: { expression: 'laugh', emoji: '🤣', bg: 'bg-emerald-200' },
  oops: { expression: 'panic', emoji: '😱', bg: 'bg-sky-200' },
  hmm: { expression: 'smug', emoji: '🤔', bg: 'bg-violet-200' },
};

function StampFace({ kind, size }: { kind: StampKind; size: number }) {
  const style = STAMP_STYLE[kind];
  return (
    <span className="relative inline-block" style={{ width: size }}>
      <MascotCharacter expression={style.expression} variant="head" animated={false} size={size} />
      <span className="absolute -bottom-1 -right-2 leading-none drop-shadow-[1px_1px_0_#0f172a]" style={{ fontSize: size * 0.45 }}>
        {style.emoji}
      </span>
      {kind === 'hmm' && (
        <span
          className="absolute -right-1 -top-2 font-black leading-none text-violet-600 [-webkit-text-stroke:1.5px_#0f172a] [paint-order:stroke_fill]"
          style={{ fontSize: size * 0.4 }}
        >
          ?
        </span>
      )}
    </span>
  );
}

interface PickerProps {
  t: Dict;
  onSend: (kind: StampKind) => boolean;
  /** Which edge of the button the 2×2 palette lines up with. */
  align?: 'left' | 'right';
  /** 'grid': 2×2 large stamps (game side column). 'row': one compact row centred above the button (action bars). */
  layout?: 'grid' | 'row';
  /** Extra classes for the button. The wrapper stays `relative` so the palette can anchor to it. */
  className?: string;
}

/** "💬 スタンプ" button that opens a palette of four large stamps; picking one sends it and closes. */
export function StampPicker({ t, onSend, align = 'left', layout = 'grid', className = '' }: PickerProps) {
  const [open, setOpen] = useState(false);
  const [cooling, setCooling] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const labels: Record<StampKind, string> = { clap: t.stampClap, lol: t.stampLol, oops: t.stampOops, hmm: t.stampHmm };

  // Close on Esc or a click anywhere else.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const send = (kind: StampKind) => {
    if (!onSend(kind)) return;
    setOpen(false);
    setCooling(true);
    window.setTimeout(() => setCooling(false), STAMP_COOLDOWN_MS);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        tabIndex={-1}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={cooling}
        onClick={() => setOpen((o) => !o)}
        className={`comic-btn flex items-center gap-2 px-5 py-2 text-xl ${open ? 'bg-amber-300' : 'bg-white'} disabled:opacity-60 ${className}`}
      >
        💬 {t.stampTray}
      </button>
      {open && layout === 'row' && (
        // Outer box positions (centred above the button); inner box animates — the pop-in owns `transform`.
        <div className="absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2">
          <div role="dialog" aria-label={t.stampTray} className="animate-balloon-pop comic-card flex gap-2 bg-white p-2 shadow-[5px_5px_0_#0f172a]">
            {STAMP_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                tabIndex={-1}
                aria-label={labels[kind]}
                onClick={() => send(kind)}
                className={`comic-btn flex h-[86px] w-[86px] flex-col items-center justify-center gap-0.5 ${STAMP_STYLE[kind].bg}`}
              >
                <StampFace kind={kind} size={48} />
                <span className="whitespace-nowrap text-xs font-black leading-none">{labels[kind]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {open && layout === 'grid' && (
        <div
          role="dialog"
          aria-label={t.stampTray}
          className={`animate-balloon-pop absolute bottom-full z-50 mb-3 ${align === 'left' ? 'left-0 origin-bottom-left' : 'right-0 origin-bottom-right'}`}
        >
          <div className="comic-card grid grid-cols-2 gap-3 bg-white p-3 shadow-[6px_6px_0_#0f172a]">
            {STAMP_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                tabIndex={-1}
                aria-label={labels[kind]}
                onClick={() => send(kind)}
                className={`comic-btn flex h-[118px] w-[118px] flex-col items-center justify-center gap-1 ${STAMP_STYLE[kind].bg}`}
              >
                <StampFace kind={kind} size={68} />
                <span className="text-base font-black leading-none">{labels[kind]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Stamps from everyone float up from the lower right and fade. Pointer-transparent overlay. */
export function StampLayer({ stamps, players, now }: { stamps: FlyingStamp[]; players: PlayerInfo[]; now: number }) {
  const live = stamps.filter((s) => now - s.at < STAMP_LIFETIME_MS);
  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden" aria-hidden>
      {live.map((s) => {
        const name = players.find((p) => p.id === s.playerId)?.name ?? '';
        // Spread stamps sideways so a burst doesn't stack on one spot.
        const x = 40 + ((s.id * 67) % 190);
        return (
          <div key={s.id} className="animate-stamp-float absolute flex flex-col items-center" style={{ right: x, bottom: 110 }}>
            <StampFace kind={s.kind} size={64} />
            <span className="mt-1 max-w-[120px] truncate rounded-md bg-slate-900/85 px-2 text-xs font-black text-white">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

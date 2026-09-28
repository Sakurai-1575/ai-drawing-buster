import { useEffect, useState, type CSSProperties } from 'react';
import { sound } from '../audio/SoundManager';
import { loadModeBest, SOLO_MODES, type SoloMode } from '../game/engine';
import { fmt, type Dict } from '../i18n';
import { MascotCharacter } from './MascotCharacter';

interface Props {
  t: Dict;
  onPick: (mode: SoloMode) => void;
  onClose: () => void;
}

const CARD: Record<SoloMode, { icon: string; bg: string; rot: string }> = {
  score: { icon: '🃏', bg: 'bg-sky-300', rot: '-2deg' },
  sudden: { icon: '🔥', bg: 'bg-rose-300', rot: '1deg' },
  timeattack: { icon: '⚡', bg: 'bg-amber-300', rot: '-1deg' },
};

/** Solo mode picker shown from the title's Start: Score Attack / Sudden Death / Time Attack. */
export function SoloModeModal({ t, onPick, onClose }: Props) {
  const [hover, setHover] = useState<SoloMode | null>(null);
  const bests = Object.fromEntries(SOLO_MODES.map((m) => [m, loadModeBest(m)])) as Record<SoloMode, number>;
  const title: Record<SoloMode, string> = { score: t.modeScore, sudden: t.modeSudden, timeattack: t.modeTA };
  const desc: Record<SoloMode, string> = { score: t.modeScoreDesc, sudden: t.modeSuddenDesc, timeattack: t.modeTADesc };
  const best: Record<SoloMode, string> = {
    score: fmt(t.modeBestScore, { n: bests.score.toLocaleString() }),
    sudden: fmt(t.modeBestSurvived, { n: bests.sudden }),
    timeattack: fmt(t.modeBestCorrect, { n: bests.timeattack }),
  };

  const pick = (mode: SoloMode) => {
    sound.unlock();
    sound.click();
    onPick(mode);
  };

  // 1/2/3 pick, Enter/Space = score attack (the old one-key start), Esc closes. Keys stay out of the title.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.repeat) return;
      if (e.code === 'Escape') onClose();
      else if (e.code === 'Digit1' || e.code === 'Numpad1') pick('score');
      else if (e.code === 'Digit2' || e.code === 'Numpad2') pick('sudden');
      else if (e.code === 'Digit3' || e.code === 'Numpad3') pick('timeattack');
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        pick(hover ?? 'score');
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60" onPointerDown={onClose} data-testid="solo-modes">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.soloPick}
        className="animate-pop-in comic-card relative flex w-[1080px] flex-col items-center gap-5 bg-amber-50 px-8 pb-8 pt-6 shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '0deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={t.close}
          onClick={onClose}
          className="comic-btn absolute right-4 top-4 flex h-11 w-11 items-center justify-center bg-white text-2xl leading-none"
        >
          ×
        </button>
        <div className="flex items-end gap-4">
          <MascotCharacter expression={hover === 'sudden' ? 'laugh' : hover ? 'smug' : 'normal'} size={96} />
          <div className="relative mb-6 rounded-2xl border-4 border-slate-900 bg-sky-200 px-5 py-2 text-2xl font-black shadow-[4px_4px_0_#0f172a]">
            {t.soloPick}
            <span className="absolute -left-[15px] bottom-3 h-6 w-6 rotate-45 border-b-4 border-l-4 border-slate-900 bg-sky-200" />
          </div>
        </div>
        <div className="grid w-full grid-cols-3 gap-6">
          {SOLO_MODES.map((m, i) => (
            <button
              key={m}
              type="button"
              tabIndex={-1}
              data-mode={m}
              onClick={() => pick(m)}
              onPointerEnter={() => setHover(m)}
              onPointerLeave={() => setHover(null)}
              className={`comic-btn group relative flex h-[300px] flex-col items-center gap-2 px-5 pt-6 text-center ${CARD[m].bg}`}
              style={{ transform: `rotate(${CARD[m].rot})` }}
            >
              <span className="absolute -left-3 -top-3 flex h-10 w-10 items-center justify-center rounded-full border-4 border-slate-900 bg-white text-xl font-black">
                {i + 1}
              </span>
              <span className="text-6xl transition-transform group-hover:scale-110">{CARD[m].icon}</span>
              <span className="text-3xl font-black leading-tight">{title[m]}</span>
              <span className="text-base font-bold leading-snug text-slate-800">{desc[m]}</span>
              <span className="mb-5 mt-auto rounded-lg bg-slate-900 px-3 py-1 text-sm font-black tabular-nums text-amber-200">{best[m]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}


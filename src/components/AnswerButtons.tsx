import type { Choices } from '../data/quizzes';
import { PENALTY_MS, type RoundState } from '../game/engine';
import type { Dict } from '../i18n';

const STYLES = [
  { bg: 'bg-rose-300', key: '1', alt: 'Q' },
  { bg: 'bg-sky-300', key: '2', alt: 'W' },
  { bg: 'bg-amber-200', key: '3', alt: 'E' },
  { bg: 'bg-emerald-300', key: '4', alt: 'R' },
];

interface Props {
  t: Dict;
  choices: Choices;
  answer: number;
  round: RoundState;
  wrongPicks: number[];
  lockRemaining: number;
  /** Full length of the lockout, for the countdown bar. */
  lockTotal?: number;
  /** Greys out every button without a reveal (e.g. before an online round starts). */
  disabled?: boolean;
  onAnswer: (index: number) => void;
}

export function AnswerButtons({ t, choices, answer, round, wrongPicks, lockRemaining, lockTotal = PENALTY_MS, disabled: allDisabled = false, onAnswer }: Props) {
  const locked = lockRemaining > 0;
  const revealing = round !== 'drawing';

  return (
    <div className="relative shrink-0">
      {locked && (
        <div className="absolute -top-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-xl border-4 border-slate-900 bg-rose-500 px-4 py-1 text-xl font-black text-white shadow-[4px_4px_0px_#0f172a]">
          <span>✕ {t.penalty}</span>
          <span className="h-3 w-32 overflow-hidden rounded-full border-2 border-slate-900 bg-white">
            <span className="block h-full bg-slate-900" style={{ width: `${Math.min(1, lockRemaining / lockTotal) * 100}%` }} />
          </span>
          <span className="tabular-nums">LOCK... {(lockRemaining / 1000).toFixed(1)}s</span>
        </div>
      )}

      <div className="grid h-[96px] grid-cols-4 gap-5">
        {choices.map((label, i) => {
          const picked = wrongPicks.includes(i);
          const isAnswer = i === answer;
          const disabled = allDisabled || locked || picked || revealing;
          let state = '';
          if (allDisabled && !revealing) state = 'opacity-60';
          else if (revealing) state = isAnswer ? 'z-10 scale-[1.04] ring-8 ring-amber-400' : 'opacity-40 grayscale';
          else if (picked) state = 'opacity-50 grayscale';
          else if (locked) state = 'opacity-60 grayscale';

          return (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              disabled={disabled}
              onPointerDown={(e) => {
                // Answer on press (not release) for snappier input.
                if (e.button === 0) onAnswer(i);
              }}
              className={`comic-btn relative flex items-center gap-3 px-4 text-left ${STYLES[i].bg} ${state}`}
            >
              <span className="flex shrink-0 flex-col items-center gap-0.5">
                <span className="key-badge">[{STYLES[i].key}]</span>
                <span className="text-xs font-black text-slate-700/70">{STYLES[i].alt}</span>
              </span>
              <span className={`min-w-0 flex-1 font-black leading-tight ${label.length > 8 ? 'text-xl' : 'text-2xl'}`}>{label}</span>
              {picked && <span className="absolute right-3 top-1 text-5xl font-black text-rose-600">✕</span>}
              {revealing && isAnswer && (
                <span className="absolute -right-3 -top-4 flex h-11 w-11 items-center justify-center rounded-full border-4 border-slate-900 bg-white text-2xl font-black text-rose-500">
                  ◯
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

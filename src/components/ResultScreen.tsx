import type { CSSProperties } from 'react';
import { useRollingNumber } from '../hooks/useRollingNumber';
import type { Lang } from '../data/quizzes';
import { averageCorrectTime, fastestTime, rankFor, type GameState, type Rank } from '../game/engine';
import { fmt, type Dict } from '../i18n';
import { Confetti } from './Confetti';
import { SettingsButton } from '../settings/SettingsButton';
import { DexButton } from '../dex/DexButton';
import { MascotCharacter } from './MascotCharacter';
import type { MascotExpression } from '../mascotLines';

export const RANK_STYLE: Record<Rank, string> = {
  S: 'bg-amber-300 text-rose-600',
  A: 'bg-rose-300 text-slate-900',
  B: 'bg-sky-300 text-slate-900',
  C: 'bg-slate-300 text-slate-700',
};

interface Props {
  state: GameState;
  t: Dict;
  lang: Lang;
  onRetry: () => void;
  onTitle: () => void;
}

export function ResultScreen(props: Props) {
  return props.state.mode === 'score' ? <ScoreResult {...props} /> : <EndlessResult {...props} />;
}

function ScoreResult({ state, t, lang, onRetry, onTitle }: Props) {
  const rank = rankFor(state.score);
  const fastest = fastestTime(state.records);
  const correct = state.records.filter((r) => r.outcome === 'correct').length;
  const misses = state.records.reduce((sum, r) => sum + r.misses, 0);
  const [shownScore] = useRollingNumber(state.score, 1400, 0);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 p-10">
      <div className="absolute right-6 top-6">
        <SettingsButton t={t} />
      </div>

      <h2 className="text-6xl font-black text-slate-900 [text-shadow:4px_4px_0_#38bdf8]">{t.result}</h2>

      <div className="flex items-stretch gap-8">
        <div className="comic-card flex w-[260px] flex-col items-center justify-center gap-2 bg-white py-6">
          <span className="text-lg font-black tracking-widest text-slate-500">{t.rank}</span>
          <span
            className={`animate-pop-in flex h-40 w-40 items-center justify-center rounded-full border-[6px] border-slate-900 text-[110px] font-black leading-none shadow-[6px_6px_0px_#0f172a] ${RANK_STYLE[rank]}`}
            style={{ '--rot': '-6deg' } as CSSProperties}
          >
            {rank}
          </span>
        </div>

        <div className="comic-card flex w-[560px] flex-col gap-4 bg-white px-7 py-6">
          <div>
            <div className="text-lg font-black tracking-widest text-slate-500">{t.totalScore}</div>
            <div className="flex items-baseline gap-4">
              {/* Combo bonuses push scores past 100,000: step the size down so the NEW RECORD badge still fits. */}
              <span className={`font-black tabular-nums text-slate-900 ${state.score >= 100_000 ? 'text-6xl' : 'text-7xl'}`}>{shownScore.toLocaleString()}</span>
              {state.isNewRecord && (
                <span className="animate-blink shrink-0 whitespace-nowrap rounded-lg border-4 border-slate-900 bg-rose-500 px-2 py-0.5 text-xl font-black text-white">
                  {t.newRecord}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Stat label={t.fastest} value={fastest === null ? '—' : `${(fastest / 1000).toFixed(2)}s`} className="bg-amber-200" />
            <Stat label={t.correctCount} value={`${correct}/${state.records.length}`} className="bg-emerald-200" />
            <Stat label={t.maxCombo} value={String(state.maxCombo)} className="bg-orange-200" />
            <Stat label={t.misses} value={String(misses)} className="bg-rose-200" />
          </div>
          <div className="flex items-center justify-between text-lg font-black text-slate-600">
            <span>{t.best}</span>
            <span className="tabular-nums">{state.bestScore.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <div className="grid w-[1060px] grid-cols-10 gap-2" data-testid="result-badges">
        {state.records.map((r, i) => {
          const label = state.questions[i].quiz.labels[lang];
          // Step the size down for long names ("Magnifying glass") and allow two lines, so text never leaves the badge.
          const size = label.length > 12 ? 'text-[11px]' : label.length > 8 ? 'text-xs' : 'text-sm';
          return (
            <div
              key={i}
              className={`flex h-[58px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[3px] border-slate-900 px-1 font-black ${
                r.outcome === 'correct' ? 'bg-emerald-200' : 'bg-slate-300'
              }`}
            >
              <span className={`line-clamp-2 w-full text-center leading-tight [overflow-wrap:anywhere] ${size}`}>{label}</span>
              <span className="text-sm tabular-nums leading-none">{r.outcome === 'correct' ? `${r.critical ? '⚡' : ''}${(r.timeMs / 1000).toFixed(2)}s` : '✕'}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-6">
        <button type="button" tabIndex={-1} onClick={onRetry} className="comic-btn flex items-center gap-3 bg-rose-400 px-10 py-3 text-3xl text-white">
          ↻ {t.retry} <span className="key-badge">Space</span>
        </button>
        <DexButton t={t} className="px-6 py-3 text-2xl" />
        <button type="button" tabIndex={-1} onClick={onTitle} className="comic-btn bg-white px-8 py-3 text-2xl">
          {t.toTitle}
        </button>
      </div>

      {state.newDex.length > 0 && (
        <div
          data-testid="dex-new"
          className="animate-pop-in absolute left-6 top-6 rounded-xl border-4 border-slate-900 bg-violet-300 px-4 py-2 text-xl font-black shadow-[4px_4px_0_#0f172a]"
          style={{ '--rot': '-3deg' } as CSSProperties}
        >
          {fmt(t.dexNew, { n: state.newDex.length })}
        </div>
      )}

      {(rank === 'S' || state.isNewRecord) && <Confetti burst={1} />}
    </div>
  );
}

/** Buster-kun's verdict tiers: [min correct, expression]. */
const TIERS: Record<'sudden' | 'timeattack', { min: number; mood: MascotExpression }[]> = {
  sudden: [
    { min: 0, mood: 'laugh' },
    { min: 5, mood: 'smug' },
    { min: 15, mood: 'panic' },
    { min: 30, mood: 'panic' },
  ],
  timeattack: [
    { min: 0, mood: 'laugh' },
    { min: 10, mood: 'smug' },
    { min: 25, mood: 'panic' },
    { min: 40, mood: 'panic' },
  ],
};

export function verdictTier(mode: 'sudden' | 'timeattack', correct: number): number {
  const tiers = TIERS[mode];
  let i = 0;
  while (i + 1 < tiers.length && correct >= tiers[i + 1].min) i++;
  return i;
}

/** Sudden death / time attack results: the headline count, mode stats, and Buster-kun's verdict. */
function EndlessResult({ state, t, onRetry, onTitle }: Props) {
  const mode = state.mode as 'sudden' | 'timeattack';
  const sudden = mode === 'sudden';
  const n = state.correctCount;
  const tier = verdictTier(mode, n);
  const line = fmt(t[`${sudden ? 'sudden' : 'ta'}Tier${tier}` as keyof Dict] as string, { n });
  const answered = state.correctCount + state.wrongCount;
  const avg = averageCorrectTime(state.records);
  const [shownScore] = useRollingNumber(state.score, 1400, 0);
  const [shownCount] = useRollingNumber(n, 900, 0);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-5 p-10" data-testid="endless-result" data-mode={mode}>
      <div className="absolute right-6 top-6">
        <SettingsButton t={t} />
      </div>

      <div className="flex items-center gap-3 text-3xl font-black text-slate-700">
        <span>{sudden ? '🔥' : '⚡'}</span>
        <span>{sudden ? t.modeSudden : t.modeTA}</span>
        {state.cleared && <span className="rounded-lg bg-amber-300 px-2 text-2xl">{t.cleared}</span>}
      </div>
      <h2
        data-testid="endless-headline"
        className={`animate-pop-in text-8xl font-black text-white [-webkit-text-stroke:5px_#0f172a] [paint-order:stroke_fill] ${
          sudden ? '[text-shadow:6px_6px_0_#f43f5e]' : '[text-shadow:6px_6px_0_#f59e0b]'
        }`}
        style={{ '--rot': '-3deg' } as CSSProperties}
      >
        {fmt(sudden ? t.survivedBig : t.correctBig, { n: shownCount })}
      </h2>

      <div className="flex items-stretch gap-6">
        <div className="comic-card flex w-[640px] flex-col gap-4 bg-white px-7 py-5">
          <div className={`grid gap-3 ${sudden ? 'grid-cols-3' : 'grid-cols-4'}`} data-testid="endless-stats">
            {sudden ? (
              <>
                <Stat label={t.statSurvived} value={String(n)} className="bg-emerald-200" />
                <Stat label={t.statFinalScore} value={shownScore.toLocaleString()} className="bg-amber-200" />
                <Stat label={t.statTopSpeed} value={`${state.speed.toFixed(2)}x`} className="bg-orange-200" />
              </>
            ) : (
              <>
                <Stat label={t.statTotalCorrect} value={String(n)} className="bg-emerald-200" />
                <Stat label={t.statAccuracy} value={answered ? `${Math.round((n / answered) * 100)}%` : '—'} className="bg-sky-200" />
                <Stat label={t.statAvg} value={avg === null ? '—' : `${(avg / 1000).toFixed(2)}s`} className="bg-orange-200" />
                <Stat label={t.statFinalScore} value={shownScore.toLocaleString()} className="bg-amber-200" />
              </>
            )}
          </div>
          <div className="flex items-center justify-between text-lg font-black text-slate-600">
            <span>
              {t.maxCombo} <span className="tabular-nums text-slate-900">{state.maxCombo}</span>
            </span>
            <span className="flex items-center gap-3">
              <span data-testid="endless-best" className="tabular-nums">{fmt(sudden ? t.modeBestSurvived : t.modeBestCorrect, { n: state.modeBest })}</span>
              {state.isNewRecord && (
                <span className="animate-blink whitespace-nowrap rounded-lg border-4 border-slate-900 bg-rose-500 px-2 py-0.5 text-xl font-black text-white">
                  {t.newRecord}
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex w-[400px] items-end gap-2">
          <MascotCharacter expression={TIERS[mode][tier].mood} size={130} />
          <div
            data-testid="endless-verdict"
            className="relative mb-8 flex-1 rounded-2xl border-4 border-slate-900 bg-white px-4 py-3 text-lg font-black leading-snug shadow-[4px_4px_0_#0f172a]"
          >
            {line}
            <span className="absolute -left-[15px] bottom-4 h-6 w-6 rotate-45 border-b-4 border-l-4 border-slate-900 bg-white" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button type="button" tabIndex={-1} onClick={onRetry} className="comic-btn flex items-center gap-3 bg-rose-400 px-10 py-3 text-3xl text-white">
          ↻ {t.retry} <span className="key-badge">Space</span>
        </button>
        <DexButton t={t} className="px-6 py-3 text-2xl" />
        <button type="button" tabIndex={-1} onClick={onTitle} className="comic-btn bg-white px-8 py-3 text-2xl">
          {t.toTitle}
        </button>
      </div>

      {state.newDex.length > 0 && (
        <div
          data-testid="dex-new"
          className="animate-pop-in absolute left-6 top-6 rounded-xl border-4 border-slate-900 bg-violet-300 px-4 py-2 text-xl font-black shadow-[4px_4px_0_#0f172a]"
          style={{ '--rot': '-3deg' } as CSSProperties}
        >
          {fmt(t.dexNew, { n: state.newDex.length })}
        </div>
      )}

      {(state.isNewRecord || tier === 3) && <Confetti burst={1} />}
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`min-w-0 rounded-xl border-4 border-slate-900 px-2.5 py-2 ${className}`}>
      <div className="truncate text-xs font-black tracking-wider text-slate-600">{label}</div>
      {/* Longer values (10/10, 10.00s) step down a size so they stay inside the card. */}
      <div className={`whitespace-nowrap font-black leading-tight tabular-nums ${value.length > 4 ? 'text-2xl' : 'text-3xl'}`}>{value}</div>
    </div>
  );
}

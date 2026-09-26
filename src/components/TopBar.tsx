import type { CSSProperties } from 'react';
import { SUDDEN_LIVES, TIME_LIMIT_MS, type GameState } from '../game/engine';
import { useRollingNumber } from '../hooks/useRollingNumber';
import type { Dict } from '../i18n';
import { SettingsButton } from '../settings/SettingsButton';

interface Props {
  t: Dict;
  index: number;
  total: number;
  elapsed: number;
  score: number;
  /** False while a round's answer is being revealed (disables the panic effects). */
  active: boolean;
  onPause: () => void;
  /** Sudden death / time attack swap the question counter (and, in time attack, the timer) for mode HUDs. */
  state?: GameState;
}

export function TopBar({ t, index, total, elapsed, score, active, onPause, state }: Props) {
  const mode = state?.mode ?? 'score';
  const remaining = Math.max(0, TIME_LIMIT_MS - elapsed);
  const ratio = remaining / TIME_LIMIT_MS;
  // Green (hue 145) → red (hue 0) as time runs out.
  const hue = Math.round(145 * ratio);
  const danger = active && remaining <= 3000 && remaining > 0;
  const [shownScore, rolling] = useRollingNumber(score);

  return (
    <div className="flex h-[76px] shrink-0 items-center gap-4">
      {mode === 'score' && (
        <div className="comic-card flex h-full items-center bg-slate-900 px-5 text-amber-200">
          <span className="text-4xl font-black tracking-tight">
            Q {index + 1}
            <span className="text-2xl text-amber-200/70">/{total}</span>
          </span>
        </div>
      )}
      {state && mode === 'sudden' && <SuddenHud t={t} state={state} />}

      {state && mode === 'timeattack' ? (
        <TimeAttackHud t={t} state={state} />
      ) : (
      <div className={`comic-card relative h-full flex-1 overflow-hidden p-2 ${danger ? 'animate-danger-frame' : ''}`}>
        <div className={`relative h-full overflow-hidden rounded-lg ${danger ? 'bg-rose-200' : 'bg-slate-200'}`}>
          <div
            className={`absolute inset-y-0 left-0 rounded-lg border-r-4 border-slate-900 ${danger ? 'animate-danger-flash' : ''}`}
            style={{ width: `${ratio * 100}%`, backgroundColor: `hsl(${hue} 80% 58%)` }}
          />
          <div
            className={`absolute inset-0 flex items-center justify-center font-black tabular-nums ${
              danger ? 'text-4xl text-white [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill]' : 'text-3xl text-slate-900'
            }`}
          >
            {(remaining / 1000).toFixed(1)}s
          </div>
        </div>
      </div>
      )}

      <div
        className={`comic-card relative flex h-full min-w-[210px] flex-col items-end justify-center px-4 transition-colors ${
          rolling ? 'animate-score-bump bg-amber-300' : 'bg-amber-200'
        }`}
      >
        <span className="text-xs font-black tracking-widest text-slate-700">{t.score}</span>
        <span className={`text-3xl font-black tabular-nums leading-none ${rolling ? 'text-rose-600' : 'text-slate-900'}`}>
          {shownScore.toLocaleString()}
        </span>
        {mode === 'score' && state && state.penaltyId > 0 && state.lastPenalty > 0 && (
          <PenaltyPopup key={state.penaltyId} label={`-${state.lastPenalty.toLocaleString()}`} />
        )}
      </div>

      <SettingsButton t={t} variant="icon" onBeforeOpen={onPause} />

      <button
        type="button"
        tabIndex={-1}
        onClick={onPause}
        className="comic-btn flex h-14 w-14 items-center justify-center bg-white"
        aria-label="Pause"
      >
        <span className="flex gap-1.5">
          <span className="h-6 w-2 rounded-sm bg-slate-900" />
          <span className="h-6 w-2 rounded-sm bg-slate-900" />
        </span>
      </button>
    </div>
  );
}

/** Sudden death: hearts (💔 once lost), Q number, current speed. */
function SuddenHud({ t, state }: { t: Dict; state: GameState }) {
  return (
    <div className="flex h-full items-stretch gap-3" data-testid="sudden-hud">
      <div className="comic-card flex items-center gap-1 bg-rose-100 px-3" aria-label={`${t.lives} ${state.lives}`} data-lives={state.lives}>
        {Array.from({ length: SUDDEN_LIVES }, (_, i) => {
          const alive = i < state.lives;
          // The heart that just broke replays its animation (keyed by lifeLostId).
          const justLost = i === state.lives && state.lifeLostId > 0;
          return (
            <span
              key={justLost ? `lost-${state.lifeLostId}` : i}
              className={`text-4xl leading-none ${justLost ? 'animate-heart-break' : ''} ${alive ? '' : 'opacity-70 grayscale-[30%]'}`}
            >
              {alive ? '❤️' : '💔'}
            </span>
          );
        })}
      </div>
      <div className="comic-card flex flex-col items-center justify-center bg-slate-900 px-4 text-amber-200">
        <span className="text-xs font-black tracking-widest text-amber-200/70">Q</span>
        <span className="text-3xl font-black tabular-nums leading-none">{state.index + 1}</span>
      </div>
      <div
        key={state.speed}
        data-testid="speed"
        className={`comic-card animate-pop-in flex flex-col items-center justify-center px-3 ${state.speed > 1 ? 'bg-orange-300' : 'bg-white'}`}
        style={{ '--rot': '0deg' } as CSSProperties}
      >
        <span className="text-xs font-black tracking-widest text-slate-600">{t.speed}</span>
        <span className="text-2xl font-black tabular-nums leading-none">{state.speed.toFixed(2)}x</span>
      </div>
      <div className="comic-card flex min-w-[88px] flex-col items-center justify-center bg-orange-100 px-3">
        <span className="text-xs font-black tracking-widest text-slate-600">{t.combo}</span>
        <span className="text-2xl font-black tabular-nums leading-none">{state.combo}</span>
      </div>
    </div>
  );
}

/** Time attack: a big mm:ss countdown for the whole run, correct count and combo. */
function TimeAttackHud({ t, state }: { t: Dict; state: GameState }) {
  const secs = Math.ceil(state.taRemaining / 1000);
  const label = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
  const danger = secs <= 10;
  return (
    <div className="flex h-full flex-1 items-stretch gap-3" data-testid="ta-hud">
      <div
        className={`comic-card relative flex flex-1 items-center justify-center gap-4 ${danger ? 'animate-danger-frame bg-rose-200' : 'bg-slate-900'}`}
      >
        <span className={`text-sm font-black tracking-widest ${danger ? 'text-rose-700' : 'text-amber-200/70'}`}>{t.timeLeft}</span>
        <span
          data-testid="ta-clock"
          className={`font-black tabular-nums leading-none ${danger ? 'text-6xl text-white [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill]' : 'text-5xl text-amber-200'}`}
        >
          {label}
        </span>
        {state.penaltyId > 0 && state.lastPenalty > 0 && <PenaltyPopup key={state.penaltyId} label={`-${state.lastPenalty / 1000}s`} />}
      </div>
      <div className="comic-card flex min-w-[110px] flex-col items-center justify-center bg-emerald-200 px-3">
        <span className="text-xs font-black tracking-widest text-slate-600">{t.correctSoFar}</span>
        <span data-testid="ta-correct" className="text-3xl font-black tabular-nums leading-none">{state.correctCount}</span>
      </div>
      <div className="comic-card flex min-w-[88px] flex-col items-center justify-center bg-orange-100 px-3">
        <span className="text-xs font-black tracking-widest text-slate-600">{t.combo}</span>
        <span className="text-3xl font-black tabular-nums leading-none">{state.combo}</span>
      </div>
    </div>
  );
}

/** Red "-3,000" / "-5s" that drops out of the HUD when a wrong answer costs something. */
function PenaltyPopup({ label }: { label: string }) {
  return (
    <span
      data-testid="penalty-popup"
      className="animate-penalty-drop pointer-events-none absolute -bottom-12 right-3 z-30 whitespace-nowrap text-4xl font-black tabular-nums text-rose-600 [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill] [text-shadow:3px_3px_0_#0f172a]"
    >
      {label}
    </span>
  );
}

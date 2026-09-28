import { useEffect, useRef, type CSSProperties } from 'react';
import type { Lang } from '../data/quizzes';
import { INTRO_GO_MS, REVEAL_DRAW_MS, TIME_LIMIT_MS, displayChoices, drawProgressFor, type GameState } from '../game/engine';
import { fmt, type Dict } from '../i18n';
import { useMascot } from '../hooks/useMascot';
import { AnswerButtons } from './AnswerButtons';
import { Confetti } from './Confetti';
import { DrawingCanvas } from './DrawingCanvas';
import { MascotCommentator } from './MascotCommentator';
import { TopBar } from './TopBar';

const CANVAS_SIZE = 440;
/** Answers faster than this (remaining time) get the top-tier "GOD SPEED" banner instead of "CRITICAL". */
const GOD_SPEED_REMAINING_MS = 8_500;

interface Props {
  state: GameState;
  t: Dict;
  lang: Lang;
  scale: number;
  onAnswer: (index: number) => void;
  onPause: () => void;
}

export function GameScreen({ state, t, lang, scale, onAnswer, onPause }: Props) {
  const shakeRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const redFlashRef = useRef<HTMLDivElement>(null);
  const q = state.questions[state.index];
  const revealing = state.round !== 'drawing';
  // Drawing progress is locked to the timer. When the round ends, whatever is left is
  // fast-forwarded over REVEAL_DRAW_MS so the finished picture lands with a bang.
  const progress = revealing
    ? state.revealFrom + (1 - state.revealFrom) * Math.min(1, state.revealElapsed / REVEAL_DRAW_MS)
    : drawProgressFor(state);
  const choices = displayChoices(q, lang);
  const answerLabel = choices[q.answer];
  const remaining = TIME_LIMIT_MS - state.elapsed;
  const panic = state.mode !== 'timeattack' && !revealing && !state.paused && remaining <= 3000 && remaining > 0;
  const timeoutLanded = state.round === 'timeout' && state.revealLanded;
  const record = state.records[state.index];
  const godSpeed = !!record && TIME_LIMIT_MS - record.timeMs >= GOD_SPEED_REMAINING_MS;

  // Buster-kun commentary.
  const mascot = useMascot();
  const { say } = mascot;
  // Time attack flips questions every few seconds: only greet the first one.
  useEffect(() => {
    if (state.mode !== 'timeattack' || state.index === 0) say('roundStart');
  }, [state.index, state.mode, say]);
  useEffect(() => {
    if (state.shakeId) say('wrong');
  }, [state.shakeId, say]);
  useEffect(() => {
    if (state.round === 'correct') {
      if (state.mode !== 'timeattack' || state.combo % 5 === 0) say(state.lastCritical ? 'fast' : 'correct');
    } else if (state.round === 'timeout') say('timeUp');
    // lastCritical is set in the same step as round, so it's current here.
  }, [state.round, say]);

  useEffect(() => {
    if (!state.shakeId) return;
    shakeRef.current?.animate(
      [
        { transform: 'translate(0, 0) rotate(0)' },
        { transform: 'translate(-16px, 2px) rotate(-0.8deg)' },
        { transform: 'translate(14px, -2px) rotate(0.8deg)' },
        { transform: 'translate(-10px, 1px) rotate(-0.4deg)' },
        { transform: 'translate(8px, 0) rotate(0.3deg)' },
        { transform: 'translate(-3px, 0) rotate(0)' },
        { transform: 'translate(0, 0) rotate(0)' },
      ],
      { duration: 420, easing: 'ease-out' },
    );
  }, [state.shakeId]);

  // Wrong answer: a red flash over everything (the shake above runs alongside).
  useEffect(() => {
    if (!state.penaltyId) return;
    redFlashRef.current?.animate([{ opacity: 0.55 }, { opacity: 0.25, offset: 0.3 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
  }, [state.penaltyId]);

  // CRITICAL: white flash + a punchy zoom on the whole screen.
  useEffect(() => {
    if (!state.critId) return;
    flashRef.current?.animate([{ opacity: 0.95 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
    shakeRef.current?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.035)' }, { transform: 'scale(0.99)' }, { transform: 'scale(1)' }],
      { duration: 300, easing: 'ease-out' },
    );
  }, [state.critId]);

  // Time-up: a softer flash when the completed drawing slams down.
  useEffect(() => {
    if (!timeoutLanded) return;
    flashRef.current?.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }, [timeoutLanded]);

  return (
    <div className="relative h-full w-full">
      <div ref={shakeRef} className="flex h-full flex-col gap-4 p-5">
        <TopBar
          t={t}
          index={state.index}
          total={state.questions.length}
          elapsed={state.elapsed}
          score={state.score}
          active={!revealing && state.intro <= 0}
          onPause={onPause}
          state={state}
        />

        <div className="flex min-h-0 flex-1 items-center justify-center gap-8">
          <div className="flex w-[300px] justify-center">
            <MascotCommentator event={mascot.event} lang={lang} size={240} balloonHeight={112} />
          </div>

          <div className="relative">
            <div
              className={`comic-card paper-bg relative overflow-hidden rounded-3xl ${panic ? 'animate-heartbeat' : ''} ${
                timeoutLanded ? 'animate-slam' : ''
              }`}
            >
              <DrawingCanvas strokes={q.quiz.strokes} progress={progress} size={CANVAS_SIZE} scale={scale} showPencil={!revealing} />
              {state.round === 'correct' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/30">
                  <div
                    className="animate-pop-in rounded-2xl border-4 border-slate-900 bg-rose-500 px-8 py-2 text-6xl font-black text-white shadow-[6px_6px_0px_#0f172a]"
                    style={{ '--rot': '-8deg' } as CSSProperties}
                  >
                    {t.correct}
                  </div>
                  {!state.lastCritical && (
                    <div className="animate-float-up rounded-xl border-4 border-slate-900 bg-amber-200 px-4 py-1 text-3xl font-black tabular-nums shadow-[4px_4px_0px_#0f172a]">
                      +{state.lastPoints.toLocaleString()}
                    </div>
                  )}
                  {state.lastMultiplier > 1 && (
                    <div
                      className="animate-pop-in rounded-lg border-[3px] border-slate-900 bg-orange-400 px-3 py-0.5 text-xl font-black text-white"
                      style={{ '--rot': '3deg' } as CSSProperties}
                    >
                      {t.comboBonus} ×{state.lastMultiplier.toFixed(1)}
                    </div>
                  )}
                  <div className="rounded-lg bg-slate-900 px-3 py-1 text-xl font-black text-white">{answerLabel}</div>
                </div>
              )}
              {timeoutLanded && (
                <div className="absolute inset-0 flex flex-col items-center justify-end gap-3 bg-slate-900/10 pb-8">
                  <div
                    className="animate-pop-in rounded-2xl border-4 border-slate-900 bg-slate-700 px-8 py-2 text-5xl font-black text-white shadow-[6px_6px_0px_#0f172a]"
                    style={{ '--rot': '4deg' } as CSSProperties}
                  >
                    {state.gameOver ? t.gameOver : t.timeUp}
                  </div>
                  <div
                    className="animate-pop-in rounded-xl border-4 border-slate-900 bg-white px-5 py-1.5 text-3xl font-black shadow-[4px_4px_0px_#0f172a]"
                    style={{ '--rot': '-3deg', animationDelay: '0.12s' } as CSSProperties}
                  >
                    {t.answerWas} <span className="text-rose-500">{answerLabel}</span>
                  </div>
                </div>
              )}
            </div>

            <ComboBadge t={t} combo={state.combo} />
            {state.comboBreakId > 0 && (
              <div
                key={state.comboBreakId}
                className="animate-shatter pointer-events-none absolute -right-6 -top-7 z-20 whitespace-nowrap rounded-xl border-4 border-slate-900 bg-slate-500 px-3 py-1 text-xl font-black text-white shadow-[4px_4px_0px_#0f172a]"
              >
                💔 {state.brokenCombo} {t.comboBreak}
              </div>
            )}
          </div>

          {state.mode === 'score' ? <RightPanel t={t} state={state} /> : <EndlessPanel t={t} state={state} />}
        </div>

        <AnswerButtons
          t={t}
          choices={choices}
          answer={q.answer}
          round={state.round}
          wrongPicks={state.wrongPicks}
          lockRemaining={state.lockRemaining}
          lockTotal={state.lockTotal}
          onAnswer={onAnswer}
        />
      </div>

      {state.intro > 0 && <IntroOverlay go={state.intro <= INTRO_GO_MS} paused={state.paused} />}
      {panic && <div className="danger-vignette pointer-events-none absolute inset-0 z-30" />}
      {state.round === 'correct' && state.lastCritical && (
        <CriticalBurst key={state.critId} label={godSpeed ? '⚡ GOD SPEED!!' : '💥 CRITICAL!!'} points={state.lastPoints} />
      )}
      <Confetti burst={state.confettiId} />
      <div ref={redFlashRef} className="pointer-events-none absolute inset-0 z-50 bg-rose-600 opacity-0" />
      <div ref={flashRef} className="pointer-events-none absolute inset-0 z-50 bg-white opacity-0" />
    </div>
  );
}

function RightPanel({ t, state }: { t: Dict; state: GameState }) {
  return (
    <div className="flex w-[300px] flex-col gap-5">
      <div className="comic-card px-4 py-3">
        <div className="mb-2 text-sm font-black tracking-widest text-slate-500">{t.history}</div>
        <div className="grid grid-cols-5 gap-2">
          {state.questions.map((_, i) => {
            const rec = state.records[i];
            const current = i === state.index && !rec;
            let cls = 'bg-slate-100 text-slate-400';
            if (rec?.outcome === 'correct') cls = 'bg-emerald-300 text-slate-900';
            else if (rec?.outcome === 'timeout') cls = 'bg-slate-400 text-white';
            else if (current) cls = 'bg-amber-200 text-slate-900 animate-blink';
            return (
              <div key={i} className={`flex h-11 items-center justify-center rounded-lg border-[3px] border-slate-900 text-lg font-black ${cls}`}>
                {rec ? (rec.outcome === 'correct' ? '◯' : '✕') : i + 1}
              </div>
            );
          })}
        </div>
      </div>
      <div className="comic-card flex items-center justify-between bg-violet-200 px-4 py-3">
        <span className="text-sm font-black tracking-widest text-slate-700">{t.best}</span>
        <span className="text-2xl font-black tabular-nums">{state.bestScore.toLocaleString()}</span>
      </div>
    </div>
  );
}

/** Sudden death / time attack: last results as a scrolling strip, plus this mode's best. */
function EndlessPanel({ t, state }: { t: Dict; state: GameState }) {
  const recent = state.records.slice(-15);
  const offset = state.records.length - recent.length;
  return (
    <div className="flex w-[300px] flex-col gap-5">
      <div className="comic-card px-4 py-3">
        <div className="mb-2 text-sm font-black tracking-widest text-slate-500">{t.history}</div>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 15 }, (_, i) => {
            const rec = recent[i];
            const n = offset + i + 1;
            const current = !rec && n === state.index + 1;
            let cls = 'bg-slate-100 text-slate-300';
            if (rec?.outcome === 'correct') cls = 'bg-emerald-300 text-slate-900';
            else if (rec) cls = 'bg-slate-400 text-white';
            else if (current) cls = 'bg-amber-200 text-slate-900 animate-blink';
            return (
              <div key={i} className={`flex h-11 items-center justify-center rounded-lg border-[3px] border-slate-900 text-lg font-black ${cls}`}>
                {rec ? (rec.outcome === 'correct' ? '◯' : '✕') : current ? n : ''}
              </div>
            );
          })}
        </div>
      </div>
      <div className="comic-card flex items-center justify-between bg-violet-200 px-4 py-3">
        <span className="text-sm font-black tracking-widest text-slate-700">{t.best}</span>
        <span className="text-2xl font-black tabular-nums">
          {fmt(state.mode === 'sudden' ? t.modeBestSurvived : t.modeBestCorrect, { n: state.modeBest }).replace(/^BEST\s*/, '')}
        </span>
      </div>
      <div className="comic-card flex items-center justify-between bg-amber-100 px-4 py-3">
        <span className="text-sm font-black tracking-widest text-slate-700">{t.score}</span>
        <span className="text-2xl font-black tabular-nums">{state.score.toLocaleString()}</span>
      </div>
    </div>
  );
}

function ComboBadge({ t, combo }: { t: Dict; combo: number }) {
  if (combo < 2) return null;
  const hot = combo >= 5;
  return (
    <div
      key={combo}
      className={`animate-combo-pop pointer-events-none absolute -right-6 -top-8 z-20 flex items-baseline gap-1.5 whitespace-nowrap rounded-2xl border-4 border-slate-900 px-4 py-1 font-black text-white shadow-[5px_5px_0px_#0f172a] ${
        hot ? 'bg-gradient-to-r from-rose-600 via-orange-500 to-amber-400' : 'bg-orange-500'
      }`}
    >
      <span className="text-4xl tabular-nums leading-none [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill]">{combo}</span>
      <span className="text-xl leading-none">{t.combo}</span>
      <span className="text-2xl leading-none">
        {Array.from({ length: Math.min(combo - 1, 5) }, (_, i) => (
          <span key={i} className="animate-flame" style={{ animationDelay: `${i * 0.07}s` }}>
            🔥
          </span>
        ))}
      </span>
    </div>
  );
}

/** READY... GO! over the whole screen before the first drawing. Language-neutral on purpose (like the online READY?). */
function IntroOverlay({ go, paused }: { go: boolean; paused: boolean }) {
  const text = 'whitespace-nowrap font-black italic leading-none [-webkit-text-stroke:4px_#0f172a] [paint-order:stroke_fill] [text-shadow:8px_8px_0_#0f172a]';
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-colors duration-200 ${go ? 'bg-white/0' : 'bg-white/45'}`}
      style={{ '--intro-state': paused ? 'paused' : 'running' } as CSSProperties}
    >
      {go ? (
        <div key="go" className={`animate-intro-go text-[150px] text-rose-500 ${text}`}>
          GO!
        </div>
      ) : (
        <div key="ready" className={`animate-intro-ready text-[110px] text-amber-400 ${text}`}>
          READY...
        </div>
      )}
    </div>
  );
}

const RAYS_MASK = 'radial-gradient(circle, black 20%, transparent 65%)';

/** Screen-center GOD SPEED / CRITICAL banner with sun rays and a floating score. */
function CriticalBurst({ label, points }: { label: string; points: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center">
      <div
        className="animate-crit-rays absolute h-[900px] w-[900px] rounded-full"
        style={{
          background: 'repeating-conic-gradient(from 0deg, rgba(253,224,71,0.55) 0deg 10deg, transparent 10deg 24deg)',
          maskImage: RAYS_MASK,
          WebkitMaskImage: RAYS_MASK,
        }}
      />
      <div className="animate-crit-bounce relative whitespace-nowrap rounded-3xl border-[6px] border-slate-900 bg-gradient-to-b from-amber-300 via-yellow-300 to-orange-400 px-10 py-3 text-[88px] font-black italic leading-none text-white shadow-[10px_10px_0px_#0f172a] [-webkit-text-stroke:4px_#0f172a] [paint-order:stroke_fill]">
        {label}
      </div>
      <div className="animate-score-float relative mt-5 text-7xl font-black tabular-nums text-amber-300 [-webkit-text-stroke:4px_#0f172a] [paint-order:stroke_fill] [text-shadow:6px_6px_0_#0f172a]">
        +{points.toLocaleString()}!
      </div>
    </div>
  );
}


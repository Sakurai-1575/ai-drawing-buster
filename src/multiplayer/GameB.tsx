import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sound } from '../audio/SoundManager';
import { AnswerButtons } from '../components/AnswerButtons';
import { MascotCommentator } from '../components/MascotCommentator';
import type { Lang } from '../data/quizzes';
import { localize } from '../i18n/lang';
import { useMascot } from '../hooks/useMascot';
import { fmt, type Dict } from '../i18n';
import { PEN_COLORS, PEN_WIDTHS } from '../net/protocol';
import { ANSWER_KEYS, ReadyOverlay, RoundEndOverlay, Scoreboard, ToastFeed, useNow } from './shared';
import { SketchPad } from './SketchPad';
import { StampPicker } from './Stamps';
import type { MatchApi, MatchView } from './useMatch';
import { SettingsButton } from '../settings/SettingsButton';

const CANVAS_SIZE = 440;
/** A guess this early counts as "fast" for Buster-kun's reaction. */
const FAST_GUESS_MS = 5_000;

interface Props {
  t: Dict;
  lang: Lang;
  scale: number;
  view: MatchView;
  match: MatchApi;
}

/** Mode B round: the drawer sketches their topic; everyone else guesses from four choices. */
export function GameB({ t, lang, scale, view, match }: Props) {
  const now = useNow(true);
  const round = view.drawRound;
  const duration = round?.durationMs ?? 1;
  // Once the round is decided, stop the clock where it was.
  const clock = view.roundEnd ? Math.min(now, view.roundEnd.at) : now;
  const elapsed = round ? clock - view.roundStartLocal : -1;
  const started = elapsed >= 0;
  const remaining = Math.max(0, duration - Math.max(0, elapsed));
  const amDrawer = !!round && round.drawerId === view.me;
  const drawer = view.players.find((p) => p.id === round?.drawerId);
  const [color, setColor] = useState(0);
  const [width, setWidth] = useState(1);

  // Countdown ticks for the last 3 seconds.
  const lastBeep = useRef(4);
  useEffect(() => {
    lastBeep.current = 4;
  }, [round?.index]);
  const secondsLeft = Math.ceil(remaining / 1000);
  useEffect(() => {
    if (!started || view.roundEnd || view.mine.correctSlot !== null) return;
    if (secondsLeft >= 1 && secondsLeft <= 3 && secondsLeft < lastBeep.current) {
      lastBeep.current = secondsLeft;
      sound.countdown(secondsLeft);
    }
  }, [secondsLeft, started, view.roundEnd, view.mine.correctSlot]);

  // Buster-kun commentary.
  const mascot = useMascot();
  const { say } = mascot;
  useEffect(() => {
    if (round) say('drawStart', { name: drawer?.name ?? '?' });
  }, [round?.index, say]);
  const misses = view.mine.wrongPicks.length;
  useEffect(() => {
    if (misses) say('wrong');
  }, [misses, say]);
  const mySlot = view.mine.correctSlot;
  useEffect(() => {
    if (mySlot !== null) say((view.mine.timeMs ?? Infinity) < FAST_GUESS_MS ? 'fast' : 'correct');
  }, [mySlot, say]);
  const seenToast = useRef(0);
  const latest = view.toasts[view.toasts.length - 1];
  useEffect(() => {
    if (!latest || latest.id <= seenToast.current) return;
    seenToast.current = latest.id;
    if (latest.kind === 'fastest' && !latest.mine) say(amDrawer ? 'drawGuessed' : 'rivalFastest', { name: latest.name });
  }, [latest, amDrawer, say]);
  const roundEnd = view.roundEnd;
  useEffect(() => {
    if (roundEnd && roundEnd.results.every((r) => r.timeMs === null)) say('drawFail');
  }, [roundEnd, say]);

  // Answer keys (guessers); Ctrl/Cmd+Z undo (drawer).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (amDrawer) {
        if (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
          e.preventDefault();
          match.undoStroke();
        }
        return;
      }
      if (e.repeat) return;
      const slot = ANSWER_KEYS[e.code];
      if (slot !== undefined) {
        e.preventDefault();
        match.answer(slot);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [amDrawer, match]);

  if (!round) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-blink text-5xl font-black">{t.mpReady}</span>
      </div>
    );
  }

  const choices = localize(round.choices, lang);
  const mine = view.mine;
  const lockRemaining = Math.max(0, mine.lockUntil - now);
  const reveal: 'drawing' | 'correct' | 'timeout' = view.roundEnd ? 'timeout' : mine.correctSlot !== null ? 'correct' : 'drawing';
  const shownAnswer = view.roundEnd ? view.roundEnd.answerSlot : (mine.correctSlot ?? -1);
  const danger = started && !view.roundEnd && remaining <= 5000 && remaining > 0;
  const ratio = remaining / duration;
  const guessedCount = Object.values(view.status).filter((s) => s === 'correct').length;
  const canDraw = amDrawer && started && !view.roundEnd;

  return (
    <div className="flex h-full flex-col gap-4 p-5">
      {/* Top bar: round, timer, topic (drawer) or who's drawing (guessers), leave */}
      <div className="flex h-[76px] shrink-0 items-center gap-4">
        <div className="comic-card flex h-full items-center bg-slate-900 px-5 text-amber-200">
          <span className="text-4xl font-black tracking-tight">
            Q {round.index + 1}
            <span className="text-2xl text-amber-200/70">/{view.total}</span>
          </span>
        </div>
        <div className={`comic-card relative h-full flex-1 overflow-hidden p-2 ${danger ? 'animate-danger-frame' : ''}`}>
          <div className={`relative h-full overflow-hidden rounded-lg ${danger ? 'bg-rose-200' : 'bg-slate-200'}`}>
            <div
              className={`absolute inset-y-0 left-0 rounded-lg border-r-4 border-slate-900 ${danger ? 'animate-danger-flash' : ''}`}
              style={{ width: `${ratio * 100}%`, backgroundColor: `hsl(${Math.round(145 * ratio)} 80% 58%)` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tabular-nums">{Math.ceil(remaining / 1000)}s</div>
          </div>
        </div>
        {amDrawer ? (
          <div className="comic-card flex h-full min-w-[260px] items-center justify-center bg-amber-300 px-5 text-2xl font-black">
            <span className="animate-wiggle mr-2 inline-block">✏️</span>
            {t.mpYouDraw}
          </div>
        ) : (
          <div className="comic-card flex h-full min-w-[260px] items-center justify-center bg-emerald-200 px-5 text-xl font-black">
            <span className="animate-wiggle mr-2 inline-block">✏️</span>
            {fmt(t.mpIsDrawing, { name: drawer?.name ?? '?' })}
          </div>
        )}
        <SettingsButton t={t} variant="icon" />
        <button type="button" tabIndex={-1} onClick={match.leave} className="comic-btn h-14 bg-white px-4 text-lg">
          🚪 {t.mpLeave}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8">
        <div className="flex w-[260px] flex-col gap-4">
          <Scoreboard t={t} view={view} drawerId={round.drawerId} />
          <StampPicker t={t} onSend={match.sendStamp} />
        </div>

        <div className="relative">
          {amDrawer && <TopicRibbon t={t} topic={view.myTopic ? localize(view.myTopic, lang) : '…'} />}
          <div className={`comic-card relative overflow-hidden rounded-3xl bg-white ${danger && !amDrawer ? 'animate-heartbeat' : ''}`}>
            <SketchPad
              strokes={view.sketch}
              size={CANVAS_SIZE}
              scale={scale}
              input={canDraw ? { color, width, onBegin: match.beginStroke, onMove: match.extendStroke, onEnd: match.endStroke } : undefined}
            />
            {!started && <ReadyOverlay t={t} msLeft={-elapsed} />}
            {view.roundEnd && <RoundEndOverlay t={t} view={view} answerLabel={choices[view.roundEnd.answerSlot]} />}
            {!view.roundEnd && guessedCount > 0 && amDrawer && (
              <div
                key={guessedCount}
                className="animate-pop-in pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-xl border-4 border-slate-900 bg-emerald-300 px-4 py-1 text-2xl font-black shadow-[4px_4px_0_#0f172a]"
                style={{ '--rot': '-2deg' } as CSSProperties}
              >
                🎉 {fmt(t.mpGuessedBy, { n: guessedCount })}
              </div>
            )}
            {!view.roundEnd && mine.correctSlot !== null && (
              <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-2">
                <div
                  className="animate-pop-in whitespace-nowrap rounded-2xl border-4 border-slate-900 bg-rose-500 px-5 py-1 text-3xl font-black text-white shadow-[4px_4px_0_#0f172a]"
                  style={{ '--rot': '-3deg' } as CSSProperties}
                >
                  {t.mpYouGotIt}
                  {mine.points > 0 && <span className="ml-3 text-amber-200">+{mine.points.toLocaleString()}</span>}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex w-[260px] flex-col justify-between self-stretch">
          <ToastFeed t={t} toasts={view.toasts} now={now} />
          <MascotCommentator event={mascot.event} lang={lang} size={130} balloonHeight={96} />
        </div>
      </div>

      {amDrawer ? (
        <PenToolbar
          t={t}
          color={color}
          width={width}
          onColor={setColor}
          onWidth={setWidth}
          onUndo={match.undoStroke}
          canUndo={canDraw && view.sketch.length > 0}
          onClear={match.clearSketch}
          disabled={!canDraw}
        />
      ) : (
        <AnswerButtons
          t={t}
          choices={choices}
          answer={shownAnswer}
          round={reveal}
          wrongPicks={mine.wrongPicks}
          lockRemaining={view.roundEnd ? 0 : lockRemaining}
          disabled={!started || remaining <= 0 || mine.pending}
          onAnswer={match.answer}
        />
      )}
    </div>
  );
}

function PenToolbar({
  t,
  color,
  width,
  onColor,
  onWidth,
  onUndo,
  canUndo,
  onClear,
  disabled,
}: {
  t: Dict;
  color: number;
  width: number;
  onColor: (c: number) => void;
  onWidth: (w: number) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className={`comic-card flex h-[96px] shrink-0 items-center justify-center gap-6 bg-white px-6 ${disabled ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        {PEN_COLORS.map((c, i) => (
          <button
            key={c}
            type="button"
            tabIndex={-1}
            aria-label={`color ${i + 1}`}
            onClick={() => onColor(i)}
            className={`h-12 w-12 rounded-full border-4 border-slate-900 transition-transform ${color === i ? 'scale-110 ring-4 ring-amber-400 ring-offset-2' : 'hover:scale-105'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="h-12 w-[3px] rounded bg-slate-300" />
      <div className="flex items-center gap-3">
        {PEN_WIDTHS.map((w, i) => (
          <button
            key={w}
            type="button"
            tabIndex={-1}
            aria-label={`width ${i + 1}`}
            onClick={() => onWidth(i)}
            className={`flex h-14 w-14 items-center justify-center rounded-xl border-4 border-slate-900 ${width === i ? 'bg-amber-300' : 'bg-white hover:bg-amber-50'}`}
          >
            <span className="rounded-full bg-slate-900" style={{ width: 6 + i * 8, height: 6 + i * 8 }} />
          </button>
        ))}
      </div>
      <div className="h-12 w-[3px] rounded bg-slate-300" />
      <button
        type="button"
        tabIndex={-1}
        onClick={onUndo}
        disabled={!canUndo}
        title="Ctrl+Z"
        className="comic-btn flex items-center gap-2 bg-sky-300 px-5 py-3 text-2xl disabled:opacity-50"
      >
        ↩️ {t.mpUndo}
        <span className="key-badge text-xs">Ctrl+Z</span>
      </button>
      <button type="button" tabIndex={-1} onClick={onClear} disabled={disabled} className="comic-btn bg-rose-300 px-5 py-3 text-2xl">
        🗑️ {t.mpClear}
      </button>
    </div>
  );
}

/** The drawer's topic as a big ribbon over the top edge of the canvas. Pointer-transparent, so drawing isn't blocked. */
function TopicRibbon({ t, topic }: { t: Dict; topic: string }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-11 z-20 flex justify-center" data-testid="my-topic">
      <div
        key={topic}
        className="animate-pop-in relative flex items-center gap-3 whitespace-nowrap rounded-2xl border-4 border-slate-900 bg-gradient-to-b from-amber-200 to-amber-400 px-5 py-1.5 shadow-[5px_5px_0_#0f172a]"
        style={{ '--rot': '-1.5deg' } as CSSProperties}
      >
        {/* ribbon tails */}
        <span className="absolute -left-4 top-3 -z-10 h-9 w-8 -skew-y-12 border-4 border-slate-900 bg-rose-400" />
        <span className="absolute -right-4 top-3 -z-10 h-9 w-8 skew-y-12 border-4 border-slate-900 bg-rose-400" />
        <span className="rounded-lg bg-slate-900 px-2 py-0.5 text-sm font-black tracking-widest text-amber-200">{t.mpYourTopic}</span>
        {t.mpDrawPre && <span className="text-xl font-black">{t.mpDrawPre}</span>}
        <span data-testid="my-topic-text" className="text-4xl font-black leading-none text-rose-600 [-webkit-text-stroke:1.5px_#0f172a] [paint-order:stroke_fill]">
          {topic}
        </span>
        <span className="text-xl font-black">{t.mpDrawPost}</span>
      </div>
    </div>
  );
}

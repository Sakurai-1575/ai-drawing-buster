import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { bgm } from '../audio/BgmManager';
import { sound } from '../audio/SoundManager';
import { AnswerButtons } from '../components/AnswerButtons';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { MascotCommentator } from '../components/MascotCommentator';
import { quizOptions, type Choices, type Lang } from '../data/quizzes';
import { loadAllQuizText } from '../data/quizI18n';
import { REVEAL_DRAW_MS, TIME_LIMIT_MS, drawProgress } from '../game/engine';
import { useMascot } from '../hooks/useMascot';
import { fmt, type Dict } from '../i18n';
import { MAX_PLAYERS, MIN_PLAYERS_TO_START, NAME_MAX_LENGTH, QUESTION_COUNT_OPTIONS, type GameMode } from '../net/protocol';
import { buildInviteUrl, copyText, type Invite } from '../net/invite';
import { GameB } from './GameB';
import { ModeBSettings } from './ModeBSettings';
import { ModeSelect } from './ModeSelect';
import { StampLayer, StampPicker } from './Stamps';
import { ANSWER_KEYS, PLAYER_COLORS, ReadyOverlay, RoundEndOverlay, Scoreboard, ToastFeed, useNow } from './shared';
import { QUIZ_BY_ID, useMatch, type MatchApi, type MatchError, type MatchView } from './useMatch';
import { SettingsButton } from '../settings/SettingsButton';
import { DexButton } from '../dex/DexButton';

const NAME_KEY = 'adb.playerName';
const FAST_ANSWER_MS = 3_000;
const CANVAS_SIZE = 440;

function loadName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    /* storage unavailable */
  }
}

function errorText(t: Dict, error: MatchError): string {
  const map: Record<MatchError, string> = {
    roomNotFound: t.mpErrRoomNotFound,
    roomFull: fmt(t.mpErrRoomFull, { max: MAX_PLAYERS }),
    alreadyStarted: t.mpErrStarted,
    versionMismatch: t.mpErrVersion,
    network: t.mpErrNetwork,
    server: t.mpErrServer,
    browser: t.mpErrBrowser,
    hostLeft: t.mpErrHostLeft,
    invalidCode: t.mpErrInvalidCode,
    unknown: t.mpErrUnknown,
  };
  return map[error];
}

interface Props {
  t: Dict;
  lang: Lang;
  scale: number;
  /** Opened from an invite link: join this room right away. */
  autoJoin?: Invite | null;
  onExit: () => void;
}

export function MultiplayerScreen({ t, lang, scale, autoJoin, onExit }: Props) {
  const match = useMatch();
  const { view } = match;
  // A Mode B host sends the options in every language, so it needs all quiz text, not just its own.
  useEffect(() => {
    loadAllQuizText().catch(() => {});
  }, []);
  // Picked on the mode-select screen; a guest ends up in whatever mode the host's room uses.
  const [mode, setMode] = useState<GameMode | null>(autoJoin?.mode ?? null);
  const exit = () => {
    match.leave();
    onExit();
  };

  // Invite link: skip menus and join (with the saved name) once.
  const joinedFromInvite = useRef(false);
  const { join } = match;
  useEffect(() => {
    if (!autoJoin || joinedFromInvite.current) return;
    joinedFromInvite.current = true;
    void join(autoJoin.code, loadName() || 'Player');
  }, [autoJoin, join]);

  // Title BGM around the lobby, game BGM during a match.
  useEffect(() => {
    bgm.setScene(view.phase === 'playing' ? 'game' : 'title');
  }, [view.phase]);

  return (
    <div className="relative h-full w-full">
      {view.phase === 'menu' && !mode && <ModeSelect t={t} onPick={setMode} onBack={exit} />}
      {view.phase === 'menu' && mode && <Menu t={t} match={match} mode={mode} onBack={() => setMode(null)} />}
      {view.phase === 'connecting' && <Connecting t={t} onCancel={match.leave} />}
      {view.phase === 'lobby' && <Lobby t={t} lang={lang} view={view} match={match} />}
      {view.phase === 'playing' && view.settings.mode === 'A' && <Game t={t} lang={lang} scale={scale} view={view} match={match} />}
      {view.phase === 'playing' && view.settings.mode === 'B' && <GameB t={t} lang={lang} scale={scale} view={view} match={match} />}
      {view.phase === 'result' && <Result t={t} view={view} match={match} onExit={exit} />}
      {(view.phase === 'playing' || view.phase === 'result') && <StampLayer stamps={view.stamps} players={view.players} now={Date.now()} />}
    </div>
  );
}

// ---------------------------------------------------------------- menu

function Menu({
  t,
  match,
  mode,
  onBack,
}: {
  t: Dict;
  match: MatchApi;
  mode: GameMode;
  onBack: () => void;
}) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState('');
  const commitName = () => saveName(name.trim());

  // Esc goes back to mode select.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-10">
      <div className="absolute right-6 top-6 flex items-center gap-3">
        <SettingsButton t={t} />
      </div>
      <button type="button" tabIndex={-1} onClick={onBack} className="comic-btn absolute left-6 top-6 bg-white px-4 py-1.5 text-lg">
        ← {t.mpBackToModes}
      </button>

      <div className="-rotate-2 text-center">
        <h1 className="logo-3d text-[56px] font-black leading-tight">👥 {t.mpTitle}</h1>
        <div
          className={`mt-2 inline-block rounded-xl border-4 border-slate-900 px-4 py-1 text-xl font-black shadow-[4px_4px_0_#0f172a] ${
            mode === 'A' ? 'bg-sky-300' : 'bg-emerald-300'
          }`}
        >
          {mode === 'A' ? t.mpMode : t.mpModeB}
        </div>
      </div>
      <p className="text-xl font-black text-slate-700">{fmt(mode === 'A' ? t.mpModeDesc : t.mpModeBDesc, { max: MAX_PLAYERS })}</p>

      <div className="comic-card flex w-[720px] flex-col gap-5 bg-white px-8 py-6">
        <label className="flex items-center gap-4">
          <span className="w-28 shrink-0 text-lg font-black text-slate-600">{t.mpName}</span>
          <input
            value={name}
            maxLength={NAME_MAX_LENGTH}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            placeholder="Player"
            className="w-full select-text rounded-xl border-4 border-slate-900 px-4 py-2 text-2xl font-black outline-none focus:bg-amber-50"
          />
        </label>

        <div className="grid grid-cols-2 gap-6">
          <div className="flex flex-col gap-2 rounded-2xl border-4 border-dashed border-slate-300 p-4">
            <span className="text-sm font-black tracking-widest text-slate-500">HOST</span>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => {
                sound.unlock();
                commitName();
                void match.create(name, mode);
              }}
              className="comic-btn bg-rose-400 py-4 text-3xl text-white [-webkit-text-stroke:1.5px_#0f172a] [paint-order:stroke_fill]"
            >
              🏠 {t.mpCreate}
            </button>
          </div>
          <form
            className="flex flex-col gap-2 rounded-2xl border-4 border-dashed border-slate-300 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              sound.unlock();
              commitName();
              void match.join(code, name);
            }}
          >
            <span className="text-sm font-black tracking-widest text-slate-500">{t.mpJoinLabel}</span>
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  if (match.view.error) match.clearError();
                }}
                placeholder="BUST-1234"
                maxLength={9}
                className="w-0 flex-1 select-text rounded-xl border-4 border-slate-900 px-3 py-2 text-2xl font-black tracking-wider outline-none focus:bg-amber-50"
              />
              <button type="submit" tabIndex={-1} className="comic-btn bg-sky-300 px-5 text-2xl">
                {t.mpJoin}
              </button>
            </div>
          </form>
        </div>

        {match.view.error && (
          <div className="animate-pop-in rounded-xl border-4 border-slate-900 bg-rose-100 px-4 py-2 text-center text-lg font-black text-rose-700" style={{ '--rot': '0deg' } as CSSProperties}>
            ⚠️ {errorText(t, match.view.error)}
          </div>
        )}
      </div>
    </div>
  );
}

function Connecting({ t, onCancel }: { t: Dict; onCancel: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8">
      <div className="animate-bob text-7xl">📡</div>
      <div className="animate-blink text-4xl font-black">{t.mpConnecting}</div>
      <button type="button" tabIndex={-1} onClick={onCancel} className="comic-btn bg-white px-8 py-2 text-xl">
        {t.mpCancel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- lobby

function Lobby({ t, lang, view, match }: { t: Dict; lang: Lang; view: MatchView; match: MatchApi }) {
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; id: number } | null>(null);
  const isHost = view.role === 'host';
  const connected = view.players.filter((p) => p.connected);
  const modeB = view.settings.mode === 'B';
  const needsTopics = modeB && view.settings.topicRule === 'custom' && view.topicPool === 0;
  const canStart = isHost && connected.length >= MIN_PLAYERS_TO_START && !needsTopics;
  const slots = Array.from({ length: Math.max(MAX_PLAYERS, view.players.length) }, (_, i) => view.players[i] ?? null);

  const copy = () => {
    void copyText(view.code).then((ok) => {
      if (!ok) return;
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const copyInvite = () => {
    void copyText(buildInviteUrl(view.code, view.settings.mode)).then((ok) => {
      if (ok) sound.click();
      setToast({ ok, id: Date.now() });
      window.setTimeout(() => setToast((cur) => (cur && Date.now() - cur.id >= 2000 ? null : cur)), 2100);
    });
  };

  // Enter/Space starts the game for the host.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Typing in a text field (e.g. the custom-topic form) must not start the game.
      if ((e.target as HTMLElement | null)?.closest?.('input, textarea')) return;
      if ((e.code === 'Enter' || e.code === 'Space') && canStart && !e.repeat) {
        e.preventDefault();
        match.startMatch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canStart, match]);

  return (
    // Centered in the space *below* the fixed top-bar buttons (pt clears them), not the whole stage.
    <div className={`flex h-full flex-col items-center justify-center px-10 pb-8 pt-24 ${modeB ? 'gap-4' : 'gap-6'}`}>
      <div className="absolute right-6 top-6 flex items-center gap-3">
        <SettingsButton t={t} />
      </div>
      <button type="button" tabIndex={-1} onClick={match.leave} className="comic-btn absolute left-6 top-6 bg-white px-4 py-1.5 text-lg">
        🚪 {t.mpLeave}
      </button>
      <div
        className={`absolute left-40 top-7 -rotate-3 rounded-xl border-4 border-slate-900 px-3 py-1 text-base font-black shadow-[3px_3px_0_#0f172a] ${
          modeB ? 'bg-emerald-300' : 'bg-sky-300'
        }`}
      >
        {modeB ? t.mpModeB : t.mpMode}
      </div>

      <div className="flex items-end gap-6">
        <div className="comic-card -rotate-2 bg-amber-200 px-8 py-3 text-center">
          <div className="text-sm font-black tracking-[0.3em] text-amber-900">{t.mpRoomCode}</div>
          <div className="select-text text-6xl font-black tabular-nums tracking-wider">{view.code}</div>
        </div>
        <div className="flex flex-col items-start gap-2 pb-1">
          <div className="flex gap-2">
            <button type="button" tabIndex={-1} onClick={copy} className="comic-btn bg-white px-4 py-1 text-lg">
              📋 {copied ? t.mpCopied : t.mpCopy}
            </button>
            <button type="button" tabIndex={-1} onClick={copyInvite} className="comic-btn bg-sky-300 px-4 py-1 text-lg">
              🔗 {t.mpInvite}
            </button>
          </div>
          <span className="text-base font-black text-slate-600">{t.mpShareHint}</span>
        </div>
      </div>

      {toast && (
        // The wrapper centers; the inner element animates (the pop-in owns `transform`).
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-30 flex justify-center">
          <div
            key={toast.id}
            role="status"
            className={`animate-pop-in whitespace-nowrap rounded-xl border-4 border-slate-900 px-5 py-2 text-lg font-black shadow-[4px_4px_0_#0f172a] ${
              toast.ok ? 'bg-emerald-300' : 'bg-rose-300'
            }`}
            style={{ '--rot': '0deg' } as CSSProperties}
          >
            {toast.ok ? `✅ ${t.mpInviteCopied}` : `⚠️ ${t.mpInviteFailed}`}
          </div>
        </div>
      )}

      <div className="grid w-[900px] grid-cols-4 gap-4">
        {slots.map((p, i) => (
          <div
            key={p?.id ?? `empty-${i}`}
            className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl border-4 px-2 ${modeB ? 'h-28' : 'h-36'} ${
              p ? `comic-card ${PLAYER_COLORS[i % PLAYER_COLORS.length]} ${p.connected ? '' : 'opacity-40'}` : 'border-dashed border-slate-400 bg-white/50'
            }`}
          >
            {p ? (
              <>
                <span className={modeB ? 'text-3xl' : 'text-4xl'}>{p.isHost ? '👑' : '🙂'}</span>
                <span className="max-w-full truncate text-2xl font-black">{p.name}</span>
                <span className="flex gap-1.5">
                  {p.isHost && <Badge className="bg-slate-900 text-amber-200">HOST</Badge>}
                  {p.id === view.me && <Badge className="bg-white">{t.mpYou}</Badge>}
                </span>
              </>
            ) : (
              <span className="animate-blink text-lg font-black text-slate-400">{t.mpWaitingSlot}</span>
            )}
          </div>
        ))}
      </div>

      {modeB ? (
        <ModeBSettings t={t} lang={lang} view={view} match={match} />
      ) : (
        <div className="flex items-center gap-4">
          <span className="text-lg font-black text-slate-600">{t.mpQuestions}</span>
          {QUESTION_COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              tabIndex={-1}
              disabled={!isHost}
              onClick={() => match.updateSettings({ questionCount: n })}
              className={`comic-btn w-16 py-1 text-2xl ${view.settings.questionCount === n ? 'bg-amber-300' : 'bg-white'} ${isHost ? '' : 'disabled:opacity-100'}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {isHost ? (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            tabIndex={-1}
            disabled={!canStart}
            onClick={match.startMatch}
            className={`comic-btn w-[400px] bg-rose-500 py-4 text-4xl text-white [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill] disabled:opacity-50 ${
              canStart ? 'animate-breathe' : ''
            }`}
          >
            ▶ {t.mpStart}
          </button>
          {!canStart && (
            <span className="text-base font-black text-slate-600">{needsTopics ? t.mpNeedTopics : fmt(t.mpNeedPlayers, { min: MIN_PLAYERS_TO_START })}</span>
          )}
        </div>
      ) : (
        <div className="animate-blink rounded-2xl border-4 border-slate-900 bg-white px-8 py-4 text-2xl font-black">{t.mpWaitHost}</div>
      )}
    </div>
  );
}

function Badge({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`rounded-md border-2 border-slate-900 px-1.5 text-xs font-black leading-5 ${className}`}>{children}</span>;
}

// ---------------------------------------------------------------- game

function Game({ t, lang, scale, view, match }: { t: Dict; lang: Lang; scale: number; view: MatchView; match: MatchApi }) {
  const now = useNow(true);
  const round = view.round;
  const quiz = round ? QUIZ_BY_ID.get(round.quizId) : undefined;
  // Once the round is decided, stop the clock where it was (no counting down to 0.0s during the reveal).
  const clock = view.roundEnd ? Math.min(now, view.roundEnd.at) : now;
  const elapsed = round ? clock - view.roundStartLocal : -1;
  const started = elapsed >= 0;
  const remaining = Math.max(0, TIME_LIMIT_MS - Math.max(0, elapsed));

  // When the round ends, fast-forward the rest of the drawing like solo play.
  const drawnAtLimit = drawProgress(Math.min(Math.max(0, elapsed), TIME_LIMIT_MS));
  const progress = view.roundEnd
    ? drawnAtLimit + (1 - drawnAtLimit) * Math.min(1, (now - view.roundEnd.at) / REVEAL_DRAW_MS)
    : started
      ? drawnAtLimit
      : 0;

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
    if (round) say('roundStart');
  }, [round?.index, say]);
  const misses = view.mine.wrongPicks.length;
  const redFlashRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!misses) return;
    say('wrong');
    redFlashRef.current?.animate([{ opacity: 0.55 }, { opacity: 0.25, offset: 0.3 }, { opacity: 0 }], { duration: 480, easing: 'ease-out' });
  }, [misses, say]);
  const mySlot = view.mine.correctSlot;
  useEffect(() => {
    if (mySlot !== null) say((view.mine.timeMs ?? Infinity) < FAST_ANSWER_MS ? 'fast' : 'correct');
  }, [mySlot, say]);
  const seenToast = useRef(0);
  const latest = view.toasts[view.toasts.length - 1];
  useEffect(() => {
    if (!latest || latest.id <= seenToast.current) return;
    seenToast.current = latest.id;
    if (latest.kind === 'fastest' && !latest.mine) say('rivalFastest', { name: latest.name });
  }, [latest, say]);
  const roundEnd = view.roundEnd;
  useEffect(() => {
    if (roundEnd && roundEnd.results.every((r) => r.timeMs === null)) say('timeUp');
  }, [roundEnd, say]);

  // Answer keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const slot = ANSWER_KEYS[e.code];
      if (slot !== undefined) {
        e.preventDefault();
        match.answer(slot);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [match]);

  if (!round || !quiz) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="animate-blink text-5xl font-black">{t.mpReady}</span>
      </div>
    );
  }

  const options = quizOptions(quiz, lang);
  const choices = round.order.map((i) => options[i]) as Choices;
  const mine = view.mine;
  const lockRemaining = Math.max(0, mine.lockUntil - now);
  const reveal: 'drawing' | 'correct' | 'timeout' = view.roundEnd ? 'timeout' : mine.correctSlot !== null ? 'correct' : 'drawing';
  const shownAnswer = view.roundEnd ? view.roundEnd.answerSlot : (mine.correctSlot ?? -1);
  const danger = started && !view.roundEnd && mine.correctSlot === null && remaining <= 3000 && remaining > 0;
  const ratio = remaining / TIME_LIMIT_MS;

  return (
    <div className="relative flex h-full flex-col gap-4 p-5">
      <div ref={redFlashRef} className="pointer-events-none absolute inset-0 z-50 bg-rose-600 opacity-0" />
      {/* Top bar: question, timer, room, leave */}
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
            <div className="absolute inset-0 flex items-center justify-center text-3xl font-black tabular-nums">{(remaining / 1000).toFixed(1)}s</div>
          </div>
        </div>
        <div className="comic-card flex h-full flex-col items-center justify-center bg-amber-200 px-4">
          <span className="text-[10px] font-black tracking-widest text-slate-600">ROOM</span>
          <span className="text-xl font-black tabular-nums">{view.code}</span>
        </div>
        <SettingsButton t={t} variant="icon" />
        <button type="button" tabIndex={-1} onClick={match.leave} className="comic-btn h-14 bg-white px-4 text-lg">
          🚪 {t.mpLeave}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center gap-8">
        <div className="flex w-[260px] flex-col gap-4">
          <Scoreboard t={t} view={view} />
          <StampPicker t={t} onSend={match.sendStamp} />
        </div>

        <div className={`comic-card paper-bg relative overflow-hidden rounded-3xl ${danger ? 'animate-heartbeat' : ''}`}>
          <DrawingCanvas strokes={quiz.strokes} progress={progress} size={CANVAS_SIZE} scale={scale} showPencil={started && !view.roundEnd} />
          {!started && <ReadyOverlay t={t} msLeft={-elapsed} />}
          {view.roundEnd && <RoundEndOverlay t={t} view={view} answerLabel={choices[view.roundEnd.answerSlot]} />}
          {!view.roundEnd && mine.correctSlot !== null && (
            <div className="absolute inset-x-0 top-4 flex flex-col items-center gap-2">
              <div
                className="animate-pop-in whitespace-nowrap rounded-2xl border-4 border-slate-900 bg-rose-500 px-5 py-1 text-3xl font-black text-white shadow-[4px_4px_0_#0f172a]"
                style={{ '--rot': '-3deg' } as CSSProperties}
              >
                {t.mpYouGotIt}
                {mine.points > 0 && <span className="ml-3 text-amber-200">+{mine.points.toLocaleString()}</span>}
              </div>
              <div className="animate-blink rounded-lg bg-slate-900 px-3 py-1 text-base font-black text-white">{t.mpWaitingOthers}</div>
            </div>
          )}
        </div>

        <div className="flex w-[260px] flex-col justify-between self-stretch">
          <ToastFeed t={t} toasts={view.toasts} now={now} />
          <MascotCommentator event={mascot.event} lang={lang} size={130} balloonHeight={96} />
        </div>
      </div>

      <AnswerButtons
        t={t}
        choices={choices}
        answer={shownAnswer}
        round={reveal}
        wrongPicks={mine.wrongPicks}
        lockRemaining={view.roundEnd ? 0 : lockRemaining}
        disabled={!started || remaining <= 0}
        onAnswer={match.answer}
      />
    </div>
  );
}

// ---------------------------------------------------------------- result

function Result({ t, view, match, onExit }: { t: Dict; view: MatchView; match: MatchApi; onExit: () => void }) {
  const winner = view.players[0];
  const isHost = view.role === 'host';
  const canRematch = view.players.filter((p) => p.connected).length >= MIN_PLAYERS_TO_START;
  return (
    // Results sit in the upper area; the action bar is pinned to the bottom with a clear band above it,
    // so the stamp palette (which opens upward from the bar) never covers the standings.
    <div className="relative h-full">
      <div className="absolute right-6 top-6">
        <SettingsButton t={t} />
      </div>

      <div className="flex flex-col items-center gap-4 px-10 pt-9" data-testid="result-content">
        <h2 className="text-6xl font-black [text-shadow:4px_4px_0_#38bdf8]">{t.mpFinal}</h2>
        {winner && (
          <div
            className="animate-pop-in rounded-2xl border-4 border-slate-900 bg-amber-300 px-8 py-1.5 text-4xl font-black shadow-[6px_6px_0_#0f172a]"
            style={{ '--rot': '-3deg' } as CSSProperties}
          >
            🏆 {fmt(t.mpWinner, { name: winner.name })}
          </div>
        )}

        <div className="comic-card w-[720px] bg-white px-6 py-3" data-testid="standings">
          {view.players.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-4 border-b-2 border-slate-200 py-1.5 last:border-0 ${p.connected ? '' : 'opacity-40'} ${
                p.id === view.me ? 'rounded-lg bg-amber-100' : ''
              }`}
            >
              <span className="w-12 text-center text-4xl">{['🥇', '🥈', '🥉'][i] ?? <span className="text-2xl font-black">{i + 1}</span>}</span>
              <span className="min-w-0 flex-1 truncate text-3xl font-black">
                {p.isHost && '👑 '}
                {p.name}
                {p.id === view.me && <span className="ml-2 align-middle text-base text-rose-500">({t.mpYou})</span>}
                {!p.connected && <span className="ml-2 align-middle text-base text-slate-500">({t.mpLeft})</span>}
              </span>
              <span className="text-4xl font-black tabular-nums">{p.score.toLocaleString()}</span>
            </div>
          ))}
        </div>

        {/* Status line: its own row, never inside the button bar. */}
        {!isHost && <span className="animate-blink text-xl font-black text-slate-600">{t.mpWaitRematch}</span>}
        {isHost && !canRematch && <span className="text-base font-black text-slate-600">{fmt(t.mpNeedRematch, { min: MIN_PLAYERS_TO_START })}</span>}
      </div>

      <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-4" data-testid="result-actions">
        {isHost && (
          <>
            <button
              type="button"
              tabIndex={-1}
              disabled={!canRematch}
              onClick={match.rematch}
              className={`comic-btn bg-rose-500 px-8 py-3 text-2xl text-white [-webkit-text-stroke:1.5px_#0f172a] [paint-order:stroke_fill] disabled:opacity-50 ${
                canRematch ? 'animate-breathe' : ''
              }`}
            >
              🔥 {t.mpRematchNow}
            </button>
            <button type="button" tabIndex={-1} onClick={match.backToLobby} className="comic-btn bg-white px-5 py-3 text-xl">
              ↻ {t.mpToLobby}
            </button>
          </>
        )}
        <DexButton t={t} className="px-5 py-3 text-xl" />
        <StampPicker t={t} onSend={match.sendStamp} layout="row" className="py-3" />
        <button type="button" tabIndex={-1} onClick={onExit} className="comic-btn bg-white px-6 py-3 text-xl">
          🚪 {t.mpLeave}
        </button>
      </div>
    </div>
  );
}

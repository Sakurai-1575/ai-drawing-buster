/** Pieces shared by the Mode A and Mode B game screens. */
import { useEffect, useState, type CSSProperties } from 'react';
import { fmt, type Dict } from '../i18n';
import { COMPACT_PLAYERS, type PlayerId, type PlayerInfo } from '../net/protocol';
import type { MatchView, Toast } from './useMatch';

export const TOAST_LIFETIME_MS = 3_500;
/** The feed shares its column with Buster-kun, so only the newest few fit. */
export const TOASTS_SHOWN = 3;

/** Physical key codes → answer slot, same as solo play. */
export const ANSWER_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  KeyQ: 0,
  KeyW: 1,
  KeyE: 2,
  KeyR: 3,
};

/** Player colors, by join order: one per seat up to MAX_PLAYERS (8), wrapping beyond. */
export const PLAYER_COLORS = ['bg-rose-300', 'bg-sky-300', 'bg-emerald-300', 'bg-amber-300', 'bg-violet-300', 'bg-orange-300', 'bg-lime-300', 'bg-pink-300'];

/** Current Date.now(), re-rendered every animation frame while `active`. */
export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const frame = () => {
      setNow(Date.now());
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return now;
}

export function ReadyOverlay({ t, msLeft }: { t: Dict; msLeft: number }) {
  const n = Math.ceil(msLeft / 600);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/60">
      <span className="text-4xl font-black text-slate-700">{t.mpReady}</span>
      <span key={n} className="animate-pop-in text-8xl font-black text-rose-500 [-webkit-text-stroke:3px_#0f172a] [paint-order:stroke_fill]" style={{ '--rot': '-6deg' } as CSSProperties}>
        {Math.max(1, n)}
      </span>
    </div>
  );
}

export function RoundEndOverlay({ t, view, answerLabel }: { t: Dict; view: MatchView; answerLabel: string }) {
  const results = view.roundEnd?.results ?? [];
  const byId = new Map(results.map((r) => [r.playerId, r]));
  // With a full room the list still has to leave the drawing's upper half visible.
  const compact = view.players.length > COMPACT_PLAYERS;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-end gap-3 bg-slate-900/15 pb-5">
      <div className="animate-pop-in rounded-xl border-4 border-slate-900 bg-white px-5 py-1.5 text-3xl font-black shadow-[4px_4px_0_#0f172a]" style={{ '--rot': '-3deg' } as CSSProperties}>
        {t.answerWas} <span className="text-rose-500">{answerLabel}</span>
      </div>
      <div className={`w-[360px] rounded-xl border-4 border-slate-900 bg-white/95 px-3 shadow-[4px_4px_0_#0f172a] ${compact ? 'py-1.5' : 'py-2'}`}>
        <div className="mb-1 text-xs font-black tracking-widest text-slate-500">{t.mpRoundResult}</div>
        {view.players.map((p, i) => {
          const r = byId.get(p.id);
          return (
            <div key={p.id} className={`flex items-center gap-2 font-black ${compact ? 'text-sm leading-5' : 'text-base'} ${p.connected ? '' : 'opacity-40'}`}>
              <span className="w-6 text-center">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="w-16 text-right text-sm tabular-nums text-emerald-600">{r?.points ? `+${r.points.toLocaleString()}` : ''}</span>
              <span className="w-20 text-right tabular-nums">{p.score.toLocaleString()}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Live standings. `drawerId` marks Mode B's current drawer. */
export function Scoreboard({ t, view, drawerId }: { t: Dict; view: MatchView; drawerId?: PlayerId }) {
  // Sorted live by score; colors stay tied to join order.
  const order = new Map(view.players.map((p, i) => [p.id, i]));
  const sorted = [...view.players].sort((a, b) => b.score - a.score || order.get(a.id)! - order.get(b.id)!);
  // Above COMPACT_PLAYERS, one-line rows so a full room (8) fits the column above the stamp button.
  const compact = view.players.length > COMPACT_PLAYERS;
  return (
    <div className={`flex w-[260px] flex-col ${compact ? 'gap-1.5' : 'gap-2.5'}`} data-testid="scoreboard">
      {sorted.map((p, rank) => (
        <PlayerRow
          key={p.id}
          t={t}
          player={p}
          rank={rank}
          colorIndex={order.get(p.id)!}
          me={p.id === view.me}
          status={view.status[p.id]}
          drawing={p.id === drawerId}
          compact={compact}
        />
      ))}
    </div>
  );
}

function PlayerRow({
  t,
  player,
  rank,
  colorIndex,
  me,
  status,
  drawing,
  compact,
}: {
  t: Dict;
  player: PlayerInfo;
  rank: number;
  colorIndex: number;
  me: boolean;
  status?: 'correct' | 'miss';
  drawing: boolean;
  compact: boolean;
}) {
  const name = (
    <>
      {player.isHost && '👑 '}
      {player.name}
    </>
  );
  const score = player.score.toLocaleString();
  return (
    <div
      className={`comic-card relative flex items-center gap-2 px-3 ${compact ? 'h-[42px] rounded-xl py-0' : 'py-2'} ${PLAYER_COLORS[colorIndex % PLAYER_COLORS.length]} ${me ? 'ring-4 ring-slate-900 ring-offset-2 ring-offset-amber-100' : ''} ${
        player.connected ? '' : 'opacity-40 grayscale'
      }`}
    >
      <span className={`w-6 shrink-0 text-center font-black ${compact ? 'text-lg' : 'text-xl'}`}>{['🥇', '🥈', '🥉'][rank] ?? rank + 1}</span>
      {compact ? (
        <>
          <span className="min-w-0 flex-1 truncate text-base font-black">{name}</span>
          <span className="shrink-0 text-lg font-black tabular-nums">{score}</span>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-black leading-tight">{name}</div>
          <div className="text-2xl font-black tabular-nums leading-none">{score}</div>
        </div>
      )}
      {!player.connected && <span className="shrink-0 text-xs font-black">{t.mpLeft}</span>}
      {drawing && <span className={`animate-wiggle shrink-0 ${compact ? 'text-xl' : 'text-2xl'}`}>✏️</span>}
      {status === 'correct' && (
        <span
          className={`animate-pop-in flex shrink-0 items-center justify-center rounded-full border-[3px] border-slate-900 bg-white font-black text-rose-500 ${
            compact ? 'h-7 w-7 text-base' : 'h-9 w-9 text-xl'
          }`}
        >
          ◯
        </span>
      )}
      {status === 'miss' && <span className={`animate-pop-in shrink-0 font-black text-slate-700 ${compact ? 'text-xl' : 'text-2xl'}`}>✕</span>}
    </div>
  );
}

export function ToastFeed({ t, toasts, now }: { t: Dict; toasts: Toast[]; now: number }) {
  const live = toasts.filter((x) => now - x.at < TOAST_LIFETIME_MS).slice(-TOASTS_SHOWN);
  const text = (x: Toast) => {
    const vars = { name: x.name, time: x.timeMs !== undefined ? (x.timeMs / 1000).toFixed(2) : '' };
    switch (x.kind) {
      case 'fastest':
        return fmt(t.mpToastFastest, vars);
      case 'correct':
        return fmt(t.mpToastCorrect, vars);
      case 'miss':
        return fmt(t.mpToastMiss, vars);
      case 'join':
        return fmt(t.mpToastJoin, vars);
      case 'leave':
        return fmt(t.mpToastLeave, vars);
    }
  };
  const style: Record<Toast['kind'], string> = {
    fastest: 'bg-amber-300 text-lg',
    correct: 'bg-emerald-200',
    miss: 'bg-slate-200',
    join: 'bg-sky-200',
    leave: 'bg-slate-300',
  };
  return (
    <div className="flex flex-col justify-start gap-2 pt-2">
      {live.map((x) => (
        <div
          key={x.id}
          className={`animate-pop-in rounded-xl border-[3px] border-slate-900 px-3 py-1.5 font-black leading-snug shadow-[3px_3px_0_#0f172a] ${style[x.kind]} ${
            x.mine ? 'ring-2 ring-rose-500' : ''
          } ${now - x.at > TOAST_LIFETIME_MS - 500 ? 'opacity-0 transition-opacity duration-500' : ''}`}
          style={{ '--rot': '0deg' } as CSSProperties}
        >
          {text(x)}
        </div>
      ))}
    </div>
  );
}

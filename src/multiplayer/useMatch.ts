/**
 * Online play: room lifecycle, host-authoritative rules, and the view state every client renders.
 *   Mode A — AI speed-guess battle (everyone guesses the AI's drawing).
 *   Mode B — Draw together (players take turns drawing; the others guess).
 *
 * The host runs the rules (HostState) and broadcasts HostMsg; every client — the host too —
 * folds those messages into the same MatchView via `receive`. So the host's screen is driven
 * exactly like a guest's, and there is one code path to reason about.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../audio/SoundManager';
import { DRAW_TOPICS, DRAW_TOPIC_BY_ID } from '../data/drawTopics';
import { ANSWER_INDEX, QUIZZES, quizOptions, type Choices, type Quiz } from '../data/quizzes';
import { LANGS, localize, type Lang } from '../i18n/lang';
import { PENALTY_MS, TIME_LIMIT_MS } from '../game/engine';
import {
  DRAW_ROUND_MS,
  FASTEST_BONUS,
  HEARTBEAT_MS,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  PEER_TIMEOUT_MS,
  PEN_COLORS,
  PEN_WIDTHS,
  PROTOCOL_VERSION,
  ROUND_GRACE_MS,
  ROUND_READY_MS,
  ROUND_REVEAL_FAST_MS,
  ROUND_REVEAL_MS,
  STAMP_COOLDOWN_MS,
  STAMP_KINDS,
  STROKE_FLUSH_MS,
  STROKE_SCALE,
  TOPIC_POOL_MAX,
  defaultSettings,
  isValidTopic,
  normalizeRoomCode,
  sanitizeName,
  sanitizeTopicText,
  standings,
  type CustomTopic,
  type DrawRoundSpec,
  type GameMode,
  type GuestMsg,
  type HostMsg,
  type Localized,
  type PlayerId,
  type PlayerInfo,
  type RejectReason,
  type RoomSettings,
  type RoundResult,
  type RoundSpec,
  type StampKind,
  type StrokeChunk,
} from '../net/protocol';
import { GuestRoom, HostRoom, RoomError } from '../net/room';
import { recordDexCorrect } from '../game/dex';
import { checkAchievements } from '../services/achievements';
import { loadSavedTopics } from './customTopics';

export const QUIZ_BY_ID = new Map<string, Quiz>(QUIZZES.map((q) => [q.id, q]));

/** How much later than the host saw it a guest may claim to have answered (network latency credit). */
const MAX_LATENCY_CREDIT_MS = 1_500;
const WELCOME_TIMEOUT_MS = 8_000;
const MAX_TOASTS = 5;
/** Flying stamps kept on screen at once, and how long each lives. */
const MAX_STAMPS = 12;
export const STAMP_LIFETIME_MS = 2_200;

/** Mode B scoring: a guesser earns MIN..MAX by speed; the drawer earns per correct guesser. */
const DRAW_GUESS_MIN = 2_000;
const DRAW_GUESS_RANGE = 8_000;
const DRAWER_PER_GUESS = 1_000;
const DRAWER_SPEED_RANGE = 2_000;

export type MatchPhase = 'menu' | 'connecting' | 'lobby' | 'playing' | 'result';
export type MatchError =
  | 'roomNotFound'
  | 'roomFull'
  | 'alreadyStarted'
  | 'versionMismatch'
  | 'network'
  | 'server'
  | 'browser'
  | 'hostLeft'
  | 'invalidCode'
  | 'unknown';

export type ToastKind = 'fastest' | 'correct' | 'miss' | 'join' | 'leave';

export interface Toast {
  id: number;
  kind: ToastKind;
  name: string;
  timeMs?: number;
  mine: boolean;
  /** Local Date.now() when it appeared (the view expires it). */
  at: number;
}

export interface MyRound {
  wrongPicks: number[];
  lockUntil: number;
  correctSlot: number | null;
  timeMs: number | null;
  points: number;
  /** Mode B: answer sent, waiting for the host's verdict. */
  pending: boolean;
}

/** One pen stroke on the shared Mode B canvas (same encoding as StrokeChunk, accumulated). */
export interface SketchStroke {
  id: string;
  c: number;
  w: number;
  p: number[];
}

export interface FlyingStamp {
  id: number;
  kind: StampKind;
  playerId: PlayerId;
  /** Local Date.now() when it arrived. */
  at: number;
}

export interface MatchView {
  phase: MatchPhase;
  role: 'host' | 'guest' | null;
  code: string;
  me: PlayerId;
  players: PlayerInfo[];
  settings: RoomSettings;
  /** Mode B custom topics currently in the room pool. */
  topicPool: number;
  total: number;
  /** Mode A round. */
  round: RoundSpec | null;
  /** Mode B round. */
  drawRound: DrawRoundSpec | null;
  /** Mode B: the topic, only when I'm the drawer. */
  myTopic: Localized<string> | null;
  sketch: SketchStroke[];
  /** Local Date.now() at which this round starts. */
  roundStartLocal: number;
  /** `at` is the local Date.now() when the result arrived (drives the finish-drawing animation). */
  roundEnd: { answerSlot: number; results: RoundResult[]; at: number } | null;
  /** Per-player status this round, for scoreboard badges. */
  status: Record<PlayerId, 'correct' | 'miss'>;
  mine: MyRound;
  toasts: Toast[];
  stamps: FlyingStamp[];
  error: MatchError | null;
}

const freshMine = (): MyRound => ({ wrongPicks: [], lockUntil: 0, correctSlot: null, timeMs: null, points: 0, pending: false });

const initialView = (mode: GameMode = 'A'): MatchView => ({
  phase: 'menu',
  role: null,
  code: '',
  me: '',
  players: [],
  settings: defaultSettings(mode),
  topicPool: 0,
  total: 0,
  round: null,
  drawRound: null,
  myTopic: null,
  sketch: [],
  roundStartLocal: 0,
  roundEnd: null,
  status: {},
  mine: freshMine(),
  toasts: [],
  stamps: [],
  error: null,
});

/** Index of the round in progress, whichever mode. */
export const currentRoundIndex = (v: MatchView) => v.round?.index ?? v.drawRound?.index ?? -1;

type DrawingMsg = Extract<GuestMsg, { t: 'stroke' } | { t: 'clear' } | { t: 'undo' }>;
/** Mode B topic source: an AI quiz, a draw-only topic, or a player's custom topic. */
export type TopicRef = { quizId: string } | { drawId: string } | { custom: CustomTopic };
type PlannedRound = { kind: 'A'; quizId: string; order: number[] } | { kind: 'B'; drawerId: PlayerId; topic: TopicRef };

interface HostState {
  room: HostRoom;
  players: PlayerInfo[];
  phase: 'lobby' | 'playing' | 'result';
  settings: RoomSettings;
  topicPool: (CustomTopic & { ownerId: PlayerId })[];
  rounds: PlannedRound[];
  roundIndex: number;
  /** Host-clock time the current round starts. */
  roundStart: number;
  roundDuration: number;
  roundOpen: boolean;
  /** Display slot of the right answer this round. */
  answerSlot: number;
  /** Mode B drawer this round (null in Mode A). */
  drawerId: PlayerId | null;
  /** Mode B: the AI quiz used as this round's topic (null for draw-only / custom topics). */
  topicQuizId: string | null;
  drawerEarned: number;
  answers: Map<PlayerId, { correct: boolean; timeMs: number; points: number; misses: number }>;
  firstCorrect: PlayerId | null;
  lastSeen: Map<PlayerId, number>;
  lastStamp: Map<PlayerId, number>;
  roundTimer: number;
  heartbeat: number;
}

interface GuestState {
  room: GuestRoom;
  /** hostClock − localClock, from the lowest-RTT ping so far. */
  offset: number;
  bestRtt: number;
  lastHostMsg: number;
  heartbeat: number;
  welcomeTimer: number;
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** `n` items, reshuffling the source each time it runs out (so repeats only happen when unavoidable). */
function cycle<T>(source: readonly T[], n: number): T[] {
  const out: T[] = [];
  while (out.length < n && source.length) out.push(...shuffle(source).slice(0, n - out.length));
  return out;
}

const clonePlayers = (players: PlayerInfo[]) => players.map((p) => ({ ...p }));

const REJECT_ERRORS: Record<RejectReason, MatchError> = { full: 'roomFull', started: 'alreadyStarted', version: 'versionMismatch' };

function roomErrorToMatch(err: unknown): MatchError {
  if (!(err instanceof RoomError)) return 'unknown';
  switch (err.code) {
    case 'room-not-found':
      return 'roomNotFound';
    case 'network':
      return 'network';
    case 'server':
      return 'server';
    case 'browser-unsupported':
      return 'browser';
    default:
      return 'unknown';
  }
}

function isValidChunk(c: StrokeChunk): boolean {
  return (
    typeof c?.id === 'string' &&
    c.id.length < 80 &&
    Number.isInteger(c.c) &&
    c.c >= 0 &&
    c.c < PEN_COLORS.length &&
    Number.isInteger(c.w) &&
    c.w >= 0 &&
    c.w < PEN_WIDTHS.length &&
    Array.isArray(c.p) &&
    c.p.length % 2 === 0 &&
    c.p.length <= 2_000 &&
    c.p.every((n) => Number.isInteger(n) && n >= 0 && n <= STROKE_SCALE)
  );
}

function appendChunk(sketch: SketchStroke[], chunk: StrokeChunk): SketchStroke[] {
  const i = sketch.findIndex((s) => s.id === chunk.id);
  if (i < 0) return [...sketch, { id: chunk.id, c: chunk.c, w: chunk.w, p: [...chunk.p] }];
  const next = [...sketch];
  next[i] = { ...sketch[i], p: [...sketch[i].p, ...chunk.p] };
  return next;
}

/** Every language's value, from a per-language function (fallbacks already resolved). */
function perLang<T>(f: (lang: Lang) => T): Localized<T> {
  return Object.fromEntries(LANGS.map((l) => [l, f(l)])) as Localized<T>;
}

/**
 * Topic → the four options in a shuffled display order for every language (guests may each play
 * in a different one), and where the answer landed.
 */
export function buildChoices(topic: TopicRef): { choices: DrawRoundSpec['choices']; answerSlot: number; answer: Localized<string> } {
  if ('custom' in topic) {
    const opts = shuffle([topic.custom.answer, ...topic.custom.dummies]) as Choices;
    return { choices: perLang(() => opts), answerSlot: opts.indexOf(topic.custom.answer), answer: perLang(() => topic.custom.answer) };
  }
  // Answer at ANSWER_INDEX (0) for both built-in kinds.
  const options: (lang: Lang) => Choices =
    'quizId' in topic
      ? (lang) => quizOptions(QUIZ_BY_ID.get(topic.quizId)!, lang)
      : (lang) => {
          const t = DRAW_TOPIC_BY_ID.get(topic.drawId)!;
          return [t.answer, ...t.decoys].map((x) => localize(x, lang)) as Choices;
        };
  const order = shuffle([0, 1, 2, 3]);
  return {
    choices: perLang((lang) => order.map((i) => options(lang)[i]) as Choices),
    answerSlot: order.indexOf(ANSWER_INDEX),
    answer: perLang((lang) => options(lang)[ANSWER_INDEX]),
  };
}

/** Mode B's built-in pool: every AI quiz plus the draw-only topics, optionally narrowed to genres. */
export function builtInTopics(genres: readonly string[] = []): TopicRef[] {
  const keep = (g: string) => genres.length === 0 || genres.includes(g);
  return [
    ...QUIZZES.filter((q) => keep(q.genre)).map((q) => ({ quizId: q.id })),
    ...DRAW_TOPICS.filter((t) => keep(t.genre)).map((t) => ({ drawId: t.id })),
  ];
}

function planTopics(settings: RoomSettings, pool: CustomTopic[], n: number): TopicRef[] {
  if (settings.topicRule === 'custom') return cycle(pool, n).map((custom) => ({ custom }));
  return cycle(builtInTopics(settings.topicRule === 'genre' ? settings.genres : []), n);
}

export function useMatch() {
  const [view, setView] = useState<MatchView>(() => initialView());
  const viewRef = useRef(view);
  const hostRef = useRef<HostState | null>(null);
  const guestRef = useRef<GuestState | null>(null);
  const toastSeq = useRef(0);
  const stampSeq = useRef(0);
  const myLastStamp = useRef(0);
  const strokeBuf = useRef<{ chunk: StrokeChunk | null; lastFlush: number; timer: number; seq: number }>({ chunk: null, lastFlush: 0, timer: 0, seq: 0 });

  /** Synchronous view update: handlers that run back-to-back see each other's changes. */
  const update = useCallback((fn: (v: MatchView) => MatchView) => {
    viewRef.current = fn(viewRef.current);
    setView(viewRef.current);
  }, []);

  const pushToast = (v: MatchView, toast: Omit<Toast, 'id' | 'at'>): Toast[] => {
    const now = Date.now();
    return [...v.toasts.filter((x) => now - x.at < 4000), { ...toast, id: ++toastSeq.current, at: now }].slice(-MAX_TOASTS);
  };

  // ------------------------------------------------------------ teardown

  const teardown = useCallback(() => {
    window.clearTimeout(strokeBuf.current.timer);
    strokeBuf.current.chunk = null;
    const h = hostRef.current;
    if (h) {
      window.clearTimeout(h.roundTimer);
      window.clearInterval(h.heartbeat);
      h.room.close();
      hostRef.current = null;
    }
    const g = guestRef.current;
    if (g) {
      window.clearInterval(g.heartbeat);
      window.clearTimeout(g.welcomeTimer);
      g.room.close();
      guestRef.current = null;
    }
  }, []);

  const fail = useCallback(
    (error: MatchError) => {
      teardown();
      update((v) => ({ ...initialView(v.settings.mode), error }));
    },
    [teardown, update],
  );

  // ------------------------------------------------------------ every client: apply host messages

  const receive = useCallback(
    (msg: HostMsg) => {
      const g = guestRef.current;
      if (g) g.lastHostMsg = Date.now();
      const offset = g?.offset ?? 0;

      switch (msg.t) {
        case 'welcome': {
          if (g) {
            window.clearTimeout(g.welcomeTimer);
            // Bring my saved custom topics into the room pool.
            const mine = loadSavedTopics();
            if (mine.length) g.room.send({ t: 'addTopics', topics: mine });
          }
          update((v) => ({ ...v, phase: 'lobby', me: msg.you, players: msg.players, settings: msg.settings, topicPool: msg.topicPool, error: null }));
          return;
        }
        case 'reject':
          fail(REJECT_ERRORS[msg.reason]);
          return;
        case 'pong': {
          if (!g) return;
          const now = Date.now();
          const rtt = now - msg.sent;
          if (rtt <= g.bestRtt) {
            g.bestRtt = rtt;
            g.offset = msg.hostNow + rtt / 2 - now;
          }
          return;
        }
        case 'players':
          update((v) => {
            let toasts = v.toasts;
            for (const p of msg.players) {
              const before = v.players.find((o) => o.id === p.id);
              if (p.id === v.me) continue;
              if (!before && p.connected) toasts = pushToast({ ...v, toasts }, { kind: 'join', name: p.name, mine: false });
              if (before?.connected && !p.connected) toasts = pushToast({ ...v, toasts }, { kind: 'leave', name: p.name, mine: false });
            }
            for (const o of v.players) {
              if (o.id !== v.me && o.connected && !msg.players.some((p) => p.id === o.id)) {
                toasts = pushToast({ ...v, toasts }, { kind: 'leave', name: o.name, mine: false });
              }
            }
            return { ...v, players: msg.players, toasts };
          });
          return;
        case 'settings':
          update((v) => ({ ...v, settings: msg.settings, topicPool: msg.topicPool }));
          return;
        case 'matchStart':
          update((v) => ({
            ...v,
            phase: 'playing',
            total: msg.total,
            players: msg.players,
            round: null,
            drawRound: null,
            myTopic: null,
            sketch: [],
            roundEnd: null,
            status: {},
            toasts: [],
          }));
          return;
        case 'round':
          update((v) => ({ ...v, round: msg.round, drawRound: null, roundStartLocal: msg.round.startAt - offset, roundEnd: null, status: {}, mine: freshMine() }));
          return;
        case 'drawRound':
          update((v) => ({
            ...v,
            round: null,
            drawRound: msg.round,
            myTopic: null,
            sketch: [],
            roundStartLocal: msg.round.startAt - offset,
            roundEnd: null,
            status: {},
            mine: freshMine(),
          }));
          return;
        case 'yourTopic':
          update((v) => (v.drawRound?.index === msg.round ? { ...v, myTopic: msg.answer } : v));
          return;
        case 'stroke':
          update((v) => (v.drawRound?.index === msg.round && !v.roundEnd ? { ...v, sketch: appendChunk(v.sketch, msg.chunk) } : v));
          return;
        case 'clear':
          update((v) => (v.drawRound?.index === msg.round ? { ...v, sketch: [] } : v));
          return;
        case 'undo':
          update((v) => (v.drawRound?.index === msg.round ? { ...v, sketch: v.sketch.filter((s) => s.id !== msg.id) } : v));
          return;
        case 'stamp': {
          const now = Date.now();
          sound.click();
          update((v) => ({
            ...v,
            stamps: [...v.stamps.filter((s) => now - s.at < STAMP_LIFETIME_MS), { id: ++stampSeq.current, kind: msg.kind, playerId: msg.playerId, at: now }].slice(
              -MAX_STAMPS,
            ),
          }));
          return;
        }
        case 'answered': {
          const e = msg.event;
          update((v) => {
            if (e.round !== currentRoundIndex(v)) return v;
            const player = v.players.find((p) => p.id === e.playerId);
            const mine = e.playerId === v.me;
            let myRound = v.mine;
            if (mine && v.drawRound) {
              // Mode B: the host's verdict is the only feedback a guesser gets.
              if (e.correct) sound.correct();
              else sound.wrong();
              myRound = e.correct
                ? { ...v.mine, pending: false, correctSlot: e.slot, timeMs: e.timeMs, points: e.points }
                : { ...v.mine, pending: false, wrongPicks: [...v.mine.wrongPicks, e.slot], lockUntil: Date.now() + PENALTY_MS };
            } else if (mine && e.correct) {
              myRound = { ...v.mine, points: e.points };
            } else if (!mine && e.correct) {
              sound.click();
            }
            return {
              ...v,
              players: v.players.map((p) =>
                p.id === e.playerId ? { ...p, score: e.score } : p.id === e.drawerId && e.drawerScore !== undefined ? { ...p, score: e.drawerScore } : p,
              ),
              status: { ...v.status, [e.playerId]: e.correct ? 'correct' : v.status[e.playerId] === 'correct' ? 'correct' : 'miss' },
              mine: myRound,
              toasts: pushToast(v, { kind: e.correct ? (e.fastest ? 'fastest' : 'correct') : 'miss', name: player?.name ?? '?', timeMs: e.timeMs, mine }),
            };
          });
          return;
        }
        case 'roundEnd':
          update((v) => {
            const drawing = v.drawRound?.drawerId === v.me;
            if (v.mine.correctSlot === null && !drawing) sound.timeUp();
            // Mode B: log a guessed AI quiz in the Buster Dex (different clock, so no best time).
            if (msg.quizId && v.mine.correctSlot !== null && !drawing && recordDexCorrect(msg.quizId, null)) checkAchievements({ type: 'dex' });
            return { ...v, roundEnd: { answerSlot: msg.answerSlot, results: msg.results, at: Date.now() }, players: msg.standings };
          });
          return;
        case 'matchEnd': {
          sound.fanfare();
          // Online rounds aren't counted per player here; any points means at least one hit (or a guessed drawing).
          const myScore = msg.standings.find((p) => p.id === viewRef.current.me)?.score ?? 0;
          checkAchievements({ type: 'result', mode: 'online', correctCount: myScore > 0 ? 1 : 0, questions: 0, misses: 0 });
          update((v) => ({ ...v, phase: 'result', players: msg.standings, round: null, drawRound: null, myTopic: null, roundEnd: null }));
          return;
        }
        case 'lobby':
          update((v) => ({ ...v, phase: 'lobby', players: msg.players, round: null, drawRound: null, myTopic: null, sketch: [], roundEnd: null, status: {}, toasts: [] }));
          return;
        case 'closed':
          fail('hostLeft');
          return;
      }
    },
    [fail, update],
  );

  // ------------------------------------------------------------ host: rules

  const hostBroadcast = useCallback(
    (msg: HostMsg) => {
      hostRef.current?.room.broadcast(msg);
      receive(msg);
    },
    [receive],
  );

  /** Send to one player; the host "sends" to itself by applying the message locally. */
  const hostSendTo = useCallback(
    (id: PlayerId, msg: HostMsg) => {
      const h = hostRef.current;
      if (!h) return;
      if (id === h.room.selfId) receive(msg);
      else h.room.send(id, msg);
    },
    [receive],
  );

  const broadcastPlayers = useCallback(() => {
    const h = hostRef.current;
    if (h) hostBroadcast({ t: 'players', players: clonePlayers(h.players) });
  }, [hostBroadcast]);

  const broadcastSettings = useCallback(() => {
    const h = hostRef.current;
    if (h) hostBroadcast({ t: 'settings', settings: { ...h.settings }, topicPool: h.topicPool.length });
  }, [hostBroadcast]);

  const finishMatch = useCallback(() => {
    const h = hostRef.current;
    if (!h) return;
    window.clearTimeout(h.roundTimer);
    h.roundOpen = false;
    h.phase = 'result';
    hostBroadcast({ t: 'matchEnd', standings: clonePlayers(standings(h.players)) });
  }, [hostBroadcast]);

  // startRound and endRound schedule each other; the ref breaks the declaration cycle.
  const startRoundRef = useRef<(index: number) => void>(() => {});

  /** `allCorrect`: everyone got it before time ran out, so skip ahead with a short reveal. */
  const endRound = useCallback((allCorrect = false) => {
    const h = hostRef.current;
    if (!h || !h.roundOpen) return;
    h.roundOpen = false;
    window.clearTimeout(h.roundTimer);
    const results: RoundResult[] = h.players.map((p) => {
      if (p.id === h.drawerId) return { playerId: p.id, points: h.drawerEarned, timeMs: null, misses: 0 };
      const a = h.answers.get(p.id);
      return { playerId: p.id, points: a?.correct ? a.points : 0, timeMs: a?.correct ? a.timeMs : null, misses: a?.misses ?? 0 };
    });
    hostBroadcast({
      t: 'roundEnd',
      round: h.roundIndex,
      answerSlot: h.answerSlot,
      results,
      standings: clonePlayers(standings(h.players)),
      ...(h.topicQuizId ? { quizId: h.topicQuizId } : {}),
    });
    const next = h.roundIndex + 1;
    h.roundTimer = window.setTimeout(
      () => (next < h.rounds.length ? startRoundRef.current(next) : finishMatch()),
      allCorrect ? ROUND_REVEAL_FAST_MS : ROUND_REVEAL_MS,
    );
  }, [finishMatch, hostBroadcast]);

  const checkRoundComplete = useCallback(() => {
    const h = hostRef.current;
    if (!h || !h.roundOpen) return;
    if (h.drawerId !== null && !h.players.some((p) => p.id === h.drawerId && p.connected)) {
      endRound(); // the drawer left: nothing more to guess
      return;
    }
    const guessers = h.players.filter((p) => p.connected && p.id !== h.drawerId);
    if (guessers.every((p) => h.answers.get(p.id)?.correct)) endRound(guessers.length > 0);
  }, [endRound]);

  startRoundRef.current = (start: number) => {
    const h = hostRef.current;
    if (!h) return;
    const connected = h.players.filter((p) => p.connected);
    let index = start;
    if (h.settings.mode === 'B') {
      if (connected.length < MIN_PLAYERS_TO_START) return finishMatch();
      // Skip turns whose drawer has left.
      while (index < h.rounds.length) {
        const r = h.rounds[index];
        if (r.kind === 'B' && connected.some((p) => p.id === r.drawerId)) break;
        index++;
      }
      if (index >= h.rounds.length) return finishMatch();
    }
    const r = h.rounds[index];
    h.roundIndex = index;
    h.answers = new Map();
    h.firstCorrect = null;
    h.drawerEarned = 0;
    h.roundStart = Date.now() + ROUND_READY_MS;
    h.roundOpen = true;

    if (r.kind === 'A') {
      h.drawerId = null;
      h.topicQuizId = null;
      h.roundDuration = TIME_LIMIT_MS;
      h.answerSlot = r.order.indexOf(ANSWER_INDEX);
      hostBroadcast({ t: 'round', round: { index, quizId: r.quizId, order: r.order, startAt: h.roundStart } });
    } else {
      const { choices, answerSlot, answer } = buildChoices(r.topic);
      h.drawerId = r.drawerId;
      h.topicQuizId = 'quizId' in r.topic ? r.topic.quizId : null;
      h.roundDuration = DRAW_ROUND_MS;
      h.answerSlot = answerSlot;
      hostBroadcast({ t: 'drawRound', round: { index, drawerId: r.drawerId, choices, startAt: h.roundStart, durationMs: DRAW_ROUND_MS } });
      hostSendTo(r.drawerId, { t: 'yourTopic', round: index, answer });
    }
    h.roundTimer = window.setTimeout(() => endRound(), ROUND_READY_MS + h.roundDuration + ROUND_GRACE_MS);
  };

  const hostAnswer = useCallback(
    (pid: PlayerId, round: number, slot: number, claimedMs: number) => {
      const h = hostRef.current;
      if (!h || h.phase !== 'playing' || !h.roundOpen || round !== h.roundIndex || pid === h.drawerId) return;
      const player = h.players.find((p) => p.id === pid && p.connected);
      if (!player || !Number.isInteger(slot) || slot < 0 || slot > 3) return;
      const rec = h.answers.get(pid) ?? { correct: false, timeMs: 0, points: 0, misses: 0 };
      if (rec.correct) return;

      const hostElapsed = Date.now() - h.roundStart;
      if (hostElapsed < 0) return; // answered before the round started: ignore
      // Trust the client's own timer (fair across latency), but only within a latency budget.
      const timeMs = Math.min(h.roundDuration, Math.max(0, claimedMs, hostElapsed - MAX_LATENCY_CREDIT_MS));
      const correct = slot === h.answerSlot;

      let points = 0;
      let fastest = false;
      let drawer: PlayerInfo | undefined;
      let drawerPoints: number | undefined;
      if (correct) {
        fastest = h.firstCorrect === null;
        if (fastest) h.firstCorrect = pid;
        const speed = 1 - timeMs / h.roundDuration;
        if (h.drawerId === null) {
          points = Math.ceil(TIME_LIMIT_MS - timeMs) + (fastest ? FASTEST_BONUS : 0);
        } else {
          points = DRAW_GUESS_MIN + Math.round(DRAW_GUESS_RANGE * speed) + (fastest ? FASTEST_BONUS : 0);
          drawer = h.players.find((p) => p.id === h.drawerId);
          drawerPoints = DRAWER_PER_GUESS + Math.round(DRAWER_SPEED_RANGE * speed);
          if (drawer) drawer.score += drawerPoints;
          h.drawerEarned += drawerPoints;
        }
        player.score += points;
        h.answers.set(pid, { ...rec, correct: true, timeMs, points });
      } else {
        h.answers.set(pid, { ...rec, misses: rec.misses + 1 });
      }
      hostBroadcast({
        t: 'answered',
        event: {
          round,
          playerId: pid,
          slot,
          correct,
          timeMs,
          points,
          fastest,
          score: player.score,
          ...(drawer ? { drawerId: drawer.id, drawerPoints, drawerScore: drawer.score } : {}),
        },
      });
      checkRoundComplete();
    },
    [checkRoundComplete, hostBroadcast],
  );

  const hostRemove = useCallback(
    (id: PlayerId) => {
      const h = hostRef.current;
      if (!h || id === h.room.selfId) return;
      const player = h.players.find((p) => p.id === id);
      h.lastSeen.delete(id);
      h.room.disconnect(id);
      if (!player) return;
      if (h.phase === 'lobby') {
        h.players = h.players.filter((p) => p.id !== id);
        if (h.settings.fixedDrawerId === id) {
          h.settings = { ...h.settings, fixedDrawerId: null };
          broadcastSettings();
        }
      } else {
        player.connected = false;
      }
      broadcastPlayers();
      checkRoundComplete();
    },
    [broadcastPlayers, broadcastSettings, checkRoundComplete],
  );

  const hostAddTopics = useCallback(
    (ownerId: PlayerId, topics: CustomTopic[]) => {
      const h = hostRef.current;
      if (!h || !Array.isArray(topics)) return;
      let added = 0;
      for (const t of topics.slice(0, TOPIC_POOL_MAX)) {
        if (h.topicPool.length >= TOPIC_POOL_MAX) break;
        if (typeof t?.id !== 'string' || !Array.isArray(t.dummies) || t.dummies.length !== 3 || !isValidTopic(t)) continue;
        if (h.topicPool.some((x) => x.id === t.id)) continue;
        h.topicPool.push({
          id: t.id.slice(0, 40),
          answer: sanitizeTopicText(t.answer),
          dummies: t.dummies.map(sanitizeTopicText) as [string, string, string],
          ownerId,
        });
        added++;
      }
      if (added) broadcastSettings();
    },
    [broadcastSettings],
  );

  const hostRemoveTopic = useCallback(
    (ownerId: PlayerId, id: string) => {
      const h = hostRef.current;
      if (!h) return;
      const before = h.topicPool.length;
      h.topicPool = h.topicPool.filter((t) => !(t.id === id && t.ownerId === ownerId));
      if (h.topicPool.length !== before) broadcastSettings();
    },
    [broadcastSettings],
  );

  /** Accept a drawer's stroke/clear/undo from a guest and relay it to everyone else. */
  const hostRelayDrawing = useCallback(
    (from: PlayerId, msg: DrawingMsg) => {
      const h = hostRef.current;
      if (!h || h.phase !== 'playing' || !h.roundOpen || from !== h.drawerId || msg.round !== h.roundIndex) return;
      if (msg.t === 'stroke' && !isValidChunk(msg.chunk)) return;
      if (msg.t === 'undo' && (typeof msg.id !== 'string' || msg.id.length > 80)) return;
      receive(msg);
      h.room.broadcast(msg, from);
    },
    [receive],
  );

  /** Broadcast a reaction stamp, rate-limited per player. */
  const hostStamp = useCallback(
    (from: PlayerId, kind: StampKind) => {
      const h = hostRef.current;
      if (!h || !STAMP_KINDS.includes(kind) || !h.players.some((p) => p.id === from && p.connected)) return;
      const now = Date.now();
      // A little slack under the client cooldown absorbs network jitter.
      if (now - (h.lastStamp.get(from) ?? 0) < STAMP_COOLDOWN_MS - 100) return;
      h.lastStamp.set(from, now);
      hostBroadcast({ t: 'stamp', kind, playerId: from });
    },
    [hostBroadcast],
  );

  const onGuestMessage = useCallback(
    (from: PlayerId, msg: GuestMsg) => {
      const h = hostRef.current;
      if (!h) return;
      h.lastSeen.set(from, Date.now());
      switch (msg.t) {
        case 'hello': {
          const reject = (reason: RejectReason) => {
            h.room.send(from, { t: 'reject', reason });
            h.lastSeen.delete(from);
            h.room.disconnect(from);
          };
          if (msg.version !== PROTOCOL_VERSION) return reject('version');
          if (h.phase !== 'lobby') return reject('started');
          if (h.players.some((p) => p.id === from)) return;
          if (h.players.filter((p) => p.connected).length >= MAX_PLAYERS) return reject('full');
          h.players.push({ id: from, name: sanitizeName(msg.name), score: 0, isHost: false, connected: true });
          h.room.send(from, { t: 'welcome', you: from, players: clonePlayers(h.players), settings: { ...h.settings }, topicPool: h.topicPool.length });
          broadcastPlayers();
          return;
        }
        case 'ping':
          h.room.send(from, { t: 'pong', sent: msg.sent, hostNow: Date.now() });
          return;
        case 'answer':
          hostAnswer(from, msg.round, msg.choice, msg.timeMs);
          return;
        case 'stroke':
        case 'clear':
        case 'undo':
          hostRelayDrawing(from, msg);
          return;
        case 'stamp':
          hostStamp(from, msg.kind);
          return;
        case 'addTopics':
          hostAddTopics(from, msg.topics);
          return;
        case 'removeTopic':
          hostRemoveTopic(from, msg.id);
          return;
        case 'bye':
          hostRemove(from);
          return;
      }
    },
    [broadcastPlayers, hostAddTopics, hostAnswer, hostRelayDrawing, hostRemove, hostRemoveTopic, hostStamp],
  );

  // ------------------------------------------------------------ actions

  const create = useCallback(
    async (rawName: string, mode: GameMode) => {
      teardown();
      const name = sanitizeName(rawName);
      update((v) => ({ ...v, phase: 'connecting', role: 'host', settings: defaultSettings(mode), error: null }));
      try {
        const room = await HostRoom.create({
          onMessage: (from, msg) => onGuestMessage(from, msg),
          onLeave: (id) => hostRemove(id),
          onError: (err) => fail(roomErrorToMatch(err)),
        });
        if (viewRef.current.phase !== 'connecting') {
          room.close(); // user backed out while we were connecting
          return;
        }
        const h: HostState = {
          room,
          players: [{ id: room.selfId, name, score: 0, isHost: true, connected: true }],
          phase: 'lobby',
          settings: defaultSettings(mode),
          topicPool: loadSavedTopics().map((t) => ({ ...t, ownerId: room.selfId })),
          rounds: [],
          roundIndex: 0,
          roundStart: 0,
          roundDuration: TIME_LIMIT_MS,
          roundOpen: false,
          answerSlot: -1,
          drawerId: null,
          topicQuizId: null,
          drawerEarned: 0,
          answers: new Map(),
          firstCorrect: null,
          lastSeen: new Map(),
          lastStamp: new Map(),
          roundTimer: 0,
          heartbeat: window.setInterval(() => {
            const now = Date.now();
            for (const p of h.players) {
              if (p.isHost || !p.connected) continue;
              if (now - (h.lastSeen.get(p.id) ?? now) > PEER_TIMEOUT_MS) hostRemove(p.id);
            }
          }, HEARTBEAT_MS),
        };
        hostRef.current = h;
        update((v) => ({
          ...v,
          phase: 'lobby',
          role: 'host',
          code: room.code,
          me: room.selfId,
          players: clonePlayers(h.players),
          settings: { ...h.settings },
          topicPool: h.topicPool.length,
        }));
      } catch (err) {
        fail(roomErrorToMatch(err));
      }
    },
    [fail, hostRemove, onGuestMessage, teardown, update],
  );

  const join = useCallback(
    async (rawCode: string, rawName: string) => {
      const code = normalizeRoomCode(rawCode);
      if (!code) {
        update((v) => ({ ...v, error: 'invalidCode' }));
        return;
      }
      teardown();
      update((v) => ({ ...v, phase: 'connecting', role: 'guest', code, error: null }));
      try {
        const room = await GuestRoom.join(code, {
          onMessage: (msg) => receive(msg),
          onClose: () => fail('hostLeft'),
          onError: (err) => fail(roomErrorToMatch(err)),
        });
        if (viewRef.current.phase !== 'connecting') {
          room.close();
          return;
        }
        const g: GuestState = {
          room,
          offset: 0,
          bestRtt: Infinity,
          lastHostMsg: Date.now(),
          heartbeat: window.setInterval(() => {
            if (Date.now() - g.lastHostMsg > PEER_TIMEOUT_MS) {
              fail('hostLeft');
              return;
            }
            room.send({ t: 'ping', sent: Date.now() });
          }, HEARTBEAT_MS),
          welcomeTimer: window.setTimeout(() => fail('roomNotFound'), WELCOME_TIMEOUT_MS),
        };
        guestRef.current = g;
        room.send({ t: 'hello', name: sanitizeName(rawName), version: PROTOCOL_VERSION });
        // A quick burst of pings gives a good clock-offset sample before the first round.
        for (let i = 0; i < 4; i++) window.setTimeout(() => room.send({ t: 'ping', sent: Date.now() }), i * 150);
      } catch (err) {
        fail(roomErrorToMatch(err));
      }
    },
    [fail, receive, teardown, update],
  );

  /** Host only: change lobby settings (mode itself is fixed when the room is created). */
  const updateSettings = useCallback(
    (patch: Partial<Omit<RoomSettings, 'mode'>>) => {
      const h = hostRef.current;
      if (!h || h.phase !== 'lobby') return;
      h.settings = { ...h.settings, ...patch };
      broadcastSettings();
    },
    [broadcastSettings],
  );

  /** Add my custom topics to the room pool (the caller persists them locally). */
  const addTopics = useCallback(
    (topics: CustomTopic[]) => {
      const h = hostRef.current;
      if (h) hostAddTopics(h.room.selfId, topics);
      else guestRef.current?.room.send({ t: 'addTopics', topics });
    },
    [hostAddTopics],
  );

  const removeTopic = useCallback(
    (id: string) => {
      const h = hostRef.current;
      if (h) hostRemoveTopic(h.room.selfId, id);
      else guestRef.current?.room.send({ t: 'removeTopic', id });
    },
    [hostRemoveTopic],
  );

  const startMatch = useCallback(() => {
    const h = hostRef.current;
    if (!h || h.phase !== 'lobby') return;
    const players = h.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
    if (players.length < MIN_PLAYERS_TO_START) return;
    const s = h.settings;
    if (s.mode === 'A') {
      h.rounds = shuffle(QUIZZES)
        .slice(0, s.questionCount)
        .map((q) => ({ kind: 'A', quizId: q.id, order: shuffle([0, 1, 2, 3]) }));
    } else {
      if (s.topicRule === 'custom' && h.topicPool.length === 0) return;
      const fixed = players.find((p) => p.id === s.fixedDrawerId) ?? players.find((p) => p.isHost)!;
      const drawers = s.drawerRule === 'rotate' ? Array.from({ length: s.laps }, () => players.map((p) => p.id)).flat() : Array(s.fixedCount).fill(fixed.id);
      const topics = planTopics(s, h.topicPool, drawers.length);
      h.rounds = drawers.map((drawerId, i) => ({ kind: 'B', drawerId, topic: topics[i] }));
    }
    h.players = players;
    h.phase = 'playing';
    sound.gameStart();
    hostBroadcast({ t: 'matchStart', total: h.rounds.length, players: clonePlayers(h.players) });
    startRoundRef.current(0);
  }, [hostBroadcast]);

  /** Host, from the results: same room, same members, same settings — straight into the next match. */
  const rematch = useCallback(() => {
    const h = hostRef.current;
    if (!h || h.phase !== 'result') return;
    h.phase = 'lobby';
    startMatch();
    // Couldn't start (e.g. everyone else left): land in the lobby instead.
    if (h.phase === 'lobby') {
      h.players = h.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
      hostBroadcast({ t: 'lobby', players: clonePlayers(h.players) });
    }
  }, [hostBroadcast, startMatch]);

  const backToLobby = useCallback(() => {
    const h = hostRef.current;
    if (!h || h.phase !== 'result') return;
    h.phase = 'lobby';
    h.players = h.players.filter((p) => p.connected).map((p) => ({ ...p, score: 0 }));
    hostBroadcast({ t: 'lobby', players: clonePlayers(h.players) });
  }, [hostBroadcast]);

  /** My own answer (host or guest). The host decides points. */
  const answer = useCallback(
    (slot: number) => {
      const v = viewRef.current;
      if (v.phase !== 'playing' || v.roundEnd) return;
      const now = Date.now();
      const elapsed = now - v.roundStartLocal;
      const m = v.mine;
      if (elapsed < 0 || m.correctSlot !== null || m.pending || now < m.lockUntil || m.wrongPicks.includes(slot)) return;

      if (v.round) {
        // Mode A: the quiz is public, so judge locally for instant feedback.
        if (elapsed > TIME_LIMIT_MS) return;
        const correct = QUIZ_BY_ID.has(v.round.quizId) && v.round.order[slot] === ANSWER_INDEX;
        update((x) => ({
          ...x,
          mine: correct
            ? { ...x.mine, correctSlot: slot, timeMs: elapsed }
            : { ...x.mine, wrongPicks: [...x.mine.wrongPicks, slot], lockUntil: now + PENALTY_MS },
        }));
        if (correct) {
          sound.correct();
          if (recordDexCorrect(v.round.quizId, elapsed)) checkAchievements({ type: 'dex' });
        } else {
          sound.wrong();
        }
        checkAchievements({ type: 'answer', mode: 'online', correct, timeMs: elapsed, remainingMs: correct ? TIME_LIMIT_MS - elapsed : null });
      } else if (v.drawRound) {
        // Mode B: guessers don't know the answer; wait for the host's verdict.
        if (v.drawRound.drawerId === v.me || elapsed > v.drawRound.durationMs) return;
        update((x) => ({ ...x, mine: { ...x.mine, pending: true } }));
      } else {
        return;
      }
      const round = currentRoundIndex(v);
      if (hostRef.current) hostAnswer(v.me, round, slot, elapsed);
      else guestRef.current?.room.send({ t: 'answer', round, choice: slot, timeMs: elapsed });
    },
    [hostAnswer, update],
  );

  // ------------------------------------------------------------ Mode B: my drawing

  const sendDrawing = useCallback((msg: DrawingMsg) => {
    const h = hostRef.current;
    if (h) h.room.broadcast(msg);
    else guestRef.current?.room.send(msg);
  }, []);

  const flushStroke = useCallback(() => {
    const buf = strokeBuf.current;
    window.clearTimeout(buf.timer);
    buf.timer = 0;
    const v = viewRef.current;
    if (!buf.chunk || !buf.chunk.p.length || !v.drawRound) return;
    sendDrawing({ t: 'stroke', round: v.drawRound.index, chunk: buf.chunk });
    buf.chunk = { ...buf.chunk, p: [] };
    buf.lastFlush = Date.now();
  }, [sendDrawing]);

  const canDraw = () => {
    const v = viewRef.current;
    return v.phase === 'playing' && !!v.drawRound && v.drawRound.drawerId === v.me && !v.roundEnd && Date.now() >= v.roundStartLocal;
  };

  const addPoint = useCallback(
    (x: number, y: number) => {
      const buf = strokeBuf.current;
      if (!buf.chunk) return;
      const px = Math.round(Math.min(1, Math.max(0, x)) * STROKE_SCALE);
      const py = Math.round(Math.min(1, Math.max(0, y)) * STROKE_SCALE);
      buf.chunk.p.push(px, py);
      const piece: StrokeChunk = { ...buf.chunk, p: [px, py] };
      update((v) => ({ ...v, sketch: appendChunk(v.sketch, piece) }));
      if (Date.now() - buf.lastFlush >= STROKE_FLUSH_MS) flushStroke();
      else if (!buf.timer) buf.timer = window.setTimeout(flushStroke, STROKE_FLUSH_MS);
    },
    [flushStroke, update],
  );

  /** Start a stroke at normalized (x, y). Returns false if I can't draw right now. */
  const beginStroke = useCallback(
    (color: number, width: number, x: number, y: number) => {
      if (!canDraw()) return false;
      const v = viewRef.current;
      flushStroke();
      const buf = strokeBuf.current;
      buf.chunk = { id: `${v.me.slice(-6)}:${v.drawRound!.index}:${buf.seq++}`, c: color, w: width, p: [] };
      addPoint(x, y);
      return true;
    },
    [addPoint, flushStroke],
  );

  const extendStroke = useCallback(
    (x: number, y: number) => {
      if (!strokeBuf.current.chunk || !canDraw()) return;
      addPoint(x, y);
    },
    [addPoint],
  );

  const endStroke = useCallback(() => {
    flushStroke();
    strokeBuf.current.chunk = null;
  }, [flushStroke]);

  const clearSketch = useCallback(() => {
    if (!canDraw()) return;
    const v = viewRef.current;
    window.clearTimeout(strokeBuf.current.timer);
    strokeBuf.current.chunk = null;
    update((x) => ({ ...x, sketch: [] }));
    sendDrawing({ t: 'clear', round: v.drawRound!.index });
  }, [sendDrawing, update]);

  /** Remove my last stroke (not while one is being drawn) and sync the removal. */
  const undoStroke = useCallback(() => {
    if (!canDraw() || strokeBuf.current.chunk) return;
    const v = viewRef.current;
    const last = v.sketch[v.sketch.length - 1];
    if (!last) return;
    update((x) => ({ ...x, sketch: x.sketch.filter((s) => s.id !== last.id) }));
    sendDrawing({ t: 'undo', round: v.drawRound!.index, id: last.id });
  }, [sendDrawing, update]);

  // ------------------------------------------------------------ stamps

  /** Fire a reaction stamp (client-side cooldown; the host rate-limits too). Returns false while cooling down. */
  const sendStamp = useCallback(
    (kind: StampKind) => {
      const now = Date.now();
      if (now - myLastStamp.current < STAMP_COOLDOWN_MS) return false;
      myLastStamp.current = now;
      const h = hostRef.current;
      if (h) hostStamp(h.room.selfId, kind);
      else guestRef.current?.room.send({ t: 'stamp', kind });
      return true;
    },
    [hostStamp],
  );

  // ------------------------------------------------------------ misc

  const leave = useCallback(() => {
    teardown();
    update((v) => ({ ...initialView(v.settings.mode) }));
  }, [teardown, update]);

  const clearError = useCallback(() => update((v) => ({ ...v, error: null })), [update]);

  // Close the room if the screen unmounts (back to title, window closed).
  useEffect(() => {
    const onUnload = () => teardown();
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      teardown();
    };
  }, [teardown]);

  return {
    view,
    create,
    join,
    leave,
    startMatch,
    backToLobby,
    rematch,
    updateSettings,
    addTopics,
    removeTopic,
    answer,
    beginStroke,
    extendStroke,
    endStroke,
    clearSketch,
    undoStroke,
    sendStamp,
    clearError,
  };
}

export type MatchApi = ReturnType<typeof useMatch>;


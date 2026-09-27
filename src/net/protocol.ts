/**
 * Wire protocol for online play.
 *   Mode A — AI speed-guess battle: everyone guesses the AI's drawing.
 *   Mode B — Draw together: players take turns drawing; the others guess.
 *
 * Star topology: the host is authoritative. Guests send `GuestMsg` to the host; the host
 * sends `HostMsg` to one guest or broadcasts to all. All timestamps are Date.now() ms on
 * the HOST clock; guests convert with the offset measured by ping/pong.
 */
import type { Genre } from '../data/genres';
import type { Localized } from '../i18n/lang';

export type { Localized };

export type { Genre };

/** Bump when the message shapes change so mismatched builds refuse each other cleanly. */
export const PROTOCOL_VERSION = 4;

/** Room capacity including the host. Everything else is array-based, so raising this is enough. */
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS_TO_START = 2;
export const DEFAULT_QUESTION_COUNT = 5;
export const QUESTION_COUNT_OPTIONS = [3, 5, 10] as const;

/** Countdown between the round broadcast and the pen starting to draw (absorbs latency). */
export const ROUND_READY_MS = 1_800;
/** Grace after the time limit so answers in flight still count. */
export const ROUND_GRACE_MS = 400;
/** How long the round result stays up before the next round. */
export const ROUND_REVEAL_MS = 3_500;
/** Shorter reveal when every player got it: keep the match moving. */
export const ROUND_REVEAL_FAST_MS = 1_800;
/** Bonus for the first correct answer to reach the host (buzzer order). */
export const FASTEST_BONUS = 2_000;

export const HEARTBEAT_MS = 2_000;
/** Silence longer than this means the other side is gone. */
export const PEER_TIMEOUT_MS = 7_000;

export const NAME_MAX_LENGTH = 12;

// ---------------------------------------------------------------- Mode B constants

/** Drawing time per Mode B round. */
export const DRAW_ROUND_MS = 40_000;
/** Drawer strokes are buffered and sent at most this often. */
export const STROKE_FLUSH_MS = 40;
/** Normalized coordinates are sent as integers 0..STROKE_SCALE. */
export const STROKE_SCALE = 1000;
export const PEN_COLORS = ['#0f172a', '#e11d48', '#0284c7', '#059669', '#d97706', '#7c3aed'] as const;
/** Pen widths as a fraction of the canvas side. */
export const PEN_WIDTHS = [0.008, 0.016, 0.032] as const;
export const LAP_OPTIONS = [1, 2, 3] as const;
export const FIXED_COUNT_OPTIONS = [3, 5, 10] as const;
export const TOPIC_TEXT_MAX = 16;
export const TOPIC_POOL_MAX = 200;

export type GameMode = 'A' | 'B';

/** Buster-kun reaction stamps anyone can fire during a match. */
export const STAMP_KINDS = ['clap', 'lol', 'oops', 'hmm'] as const;
export type StampKind = (typeof STAMP_KINDS)[number];
/** Minimum gap between one player's stamps (the host enforces it too). */
export const STAMP_COOLDOWN_MS = 500;
/** Mode B: take turns drawing, or one player draws every round. */
export type DrawerRule = 'rotate' | 'fixed';
export type TopicRule = 'all' | 'genre' | 'custom';

export interface RoomSettings {
  mode: GameMode;
  /** Mode A. */
  questionCount: number;
  drawerRule: DrawerRule;
  /** Mode B rotate: every player draws this many times. */
  laps: number;
  /** Mode B fixed: number of rounds. */
  fixedCount: number;
  /** Mode B fixed: who draws (null = the host). */
  fixedDrawerId: PlayerId | null;
  topicRule: TopicRule;
  /** Used when topicRule is 'genre' (empty = every genre). */
  genres: Genre[];
}

export function defaultSettings(mode: GameMode): RoomSettings {
  return {
    mode,
    questionCount: DEFAULT_QUESTION_COUNT,
    drawerRule: 'rotate',
    laps: 2,
    fixedCount: 5,
    fixedDrawerId: null,
    topicRule: 'all',
    genres: [],
  };
}

/** A player-authored Mode B topic: the answer plus three decoys. Text is shown as typed in every language. */
export interface CustomTopic {
  id: string;
  answer: string;
  dummies: [string, string, string];
}

export interface DrawRoundSpec {
  index: number;
  drawerId: PlayerId;
  /** The four options in display order — which one is right is NOT sent to guessers. */
  choices: Localized<[string, string, string, string]>; // every language filled in by the host; older hosts send ja/en only
  startAt: number;
  durationMs: number;
}

/** A piece of one pen stroke; `p` is flattened [x, y, x, y, …] in 0..STROKE_SCALE. */
export interface StrokeChunk {
  id: string;
  /** Index into PEN_COLORS / PEN_WIDTHS. */
  c: number;
  w: number;
  p: number[];
}

export type PlayerId = string;

export interface PlayerInfo {
  id: PlayerId;
  name: string;
  score: number;
  isHost: boolean;
  /** False once the player left or timed out; kept so mid-match scores stay in the results. */
  connected: boolean;
}

export interface RoundSpec {
  index: number;
  quizId: string;
  /** Shuffled indices into the quiz's choices; display slot i shows choices[order[i]]. */
  order: number[];
  /** Host-clock time when the pen starts drawing. */
  startAt: number;
}

export interface AnswerEvent {
  round: number;
  playerId: PlayerId;
  /** The slot that was picked (Mode B guessers learn right/wrong from this event). */
  slot: number;
  correct: boolean;
  timeMs: number;
  points: number;
  /** First correct answer of the round. */
  fastest: boolean;
  /** The player's total after this answer. */
  score: number;
  /** Mode B: what the drawer earned from this correct guess, and their new total. */
  drawerId?: PlayerId;
  drawerPoints?: number;
  drawerScore?: number;
}

export interface RoundResult {
  playerId: PlayerId;
  points: number;
  /** Null when the player didn't answer correctly. */
  timeMs: number | null;
  misses: number;
}

export type RejectReason = 'full' | 'started' | 'version';

export type GuestMsg =
  | { t: 'hello'; name: string; version: number }
  | { t: 'ping'; sent: number }
  | { t: 'answer'; round: number; choice: number; timeMs: number }
  | { t: 'stroke'; round: number; chunk: StrokeChunk }
  | { t: 'clear'; round: number }
  | { t: 'undo'; round: number; id: string }
  | { t: 'stamp'; kind: StampKind }
  | { t: 'addTopics'; topics: CustomTopic[] }
  | { t: 'removeTopic'; id: string }
  | { t: 'bye' };

export type HostMsg =
  | { t: 'welcome'; you: PlayerId; players: PlayerInfo[]; settings: RoomSettings; topicPool: number }
  | { t: 'reject'; reason: RejectReason }
  | { t: 'pong'; sent: number; hostNow: number }
  | { t: 'players'; players: PlayerInfo[] }
  | { t: 'settings'; settings: RoomSettings; topicPool: number }
  | { t: 'matchStart'; total: number; players: PlayerInfo[] }
  | { t: 'round'; round: RoundSpec }
  | { t: 'drawRound'; round: DrawRoundSpec }
  | { t: 'yourTopic'; round: number; answer: Localized<string> }
  | { t: 'stroke'; round: number; chunk: StrokeChunk }
  | { t: 'clear'; round: number }
  | { t: 'undo'; round: number; id: string }
  | { t: 'stamp'; kind: StampKind; playerId: PlayerId }
  | { t: 'answered'; event: AnswerEvent }
  | {
      t: 'roundEnd';
      round: number;
      answerSlot: number;
      results: RoundResult[];
      standings: PlayerInfo[];
      /** Mode B: the AI quiz behind this round, if any — revealed only now, so correct guessers can log it in their Buster Dex. */
      quizId?: string;
    }
  | { t: 'matchEnd'; standings: PlayerInfo[] }
  | { t: 'lobby'; players: PlayerInfo[] }
  | { t: 'closed' };

// ---------------------------------------------------------------- room codes

const CODE_PREFIX = 'BUST-';
/** Namespace on the shared public PeerServer so our IDs don't collide with other apps. */
const PEER_ID_PREFIX = 'ai-drawing-buster-v1-';

export function randomRoomCode(): string {
  return `${CODE_PREFIX}${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`;
}

/** Accepts "BUST-1234", "bust1234", or just "1234". Returns null if it isn't a valid code. */
export function normalizeRoomCode(input: string): string | null {
  const digits = input.toUpperCase().replace(/^\s*BUST[\s-]*/, '').replace(/\s/g, '');
  return /^\d{4}$/.test(digits) ? `${CODE_PREFIX}${digits}` : null;
}

export function roomPeerId(code: string): string {
  return PEER_ID_PREFIX + code.toLowerCase();
}

/** Trim and bound player-typed topic text. Returns '' if nothing usable is left. */
export function sanitizeTopicText(text: string): string {
  return text.replace(/[ -]/g, '').trim().slice(0, TOPIC_TEXT_MAX);
}

/** A custom topic is valid when all four texts are non-empty and distinct. */
export function isValidTopic(t: Pick<CustomTopic, 'answer' | 'dummies'>): boolean {
  const all = [t.answer, ...t.dummies].map(sanitizeTopicText);
  return all.every(Boolean) && new Set(all).size === 4;
}

export function sanitizeName(name: string): string {
  const clean = name.replace(/[\u0000-\u001f]/g, '').trim().slice(0, NAME_MAX_LENGTH);
  return clean || 'Player';
}

/** Ranking order: score desc, then join order (stable). */
export function standings(players: PlayerInfo[]): PlayerInfo[] {
  return players
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map(({ p }) => p);
}

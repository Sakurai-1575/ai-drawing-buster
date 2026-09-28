/**
 * Buster Dex progress: which AI quizzes the player has answered correctly (in any mode),
 * with first-solve date, best time, and total correct count. Persisted in localStorage.
 */
import { QUIZZES } from '../data/quizzes';

const KEY = 'buster_dex_progress';

export interface DexStat {
  /** Unix ms of the first correct answer. */
  firstCorrectAt: number;
  /** Fastest correct answer on the AI's 10-second clock (Solo / Mode A); null if only solved in Mode B. */
  bestTimeMs: number | null;
  correctCount: number;
}

export interface DexProgress {
  version: 1;
  /** Discovered quiz ids, in discovery order. */
  discovered: string[];
  stats: Record<string, DexStat>;
}

const QUIZ_IDS = new Set(QUIZZES.map((q) => q.id));
const empty = (): DexProgress => ({ version: 1, discovered: [], stats: {} });
const listeners = new Set<() => void>();

export function loadDex(): DexProgress {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as DexProgress | null;
    if (!raw || raw.version !== 1 || !Array.isArray(raw.discovered) || typeof raw.stats !== 'object') return empty();
    // Drop ids that no longer exist (renamed/removed quizzes).
    const discovered = raw.discovered.filter((id) => QUIZ_IDS.has(id) && raw.stats[id]);
    return { version: 1, discovered, stats: Object.fromEntries(discovered.map((id) => [id, raw.stats[id]])) };
  } catch {
    return empty();
  }
}

function save(p: DexProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((fn) => fn());
}

/** Call on every correct answer. `timeMs` is null for untimed/other-clock rounds (Mode B). Returns true on first discovery. */
export function recordDexCorrect(quizId: string, timeMs: number | null): boolean {
  if (!QUIZ_IDS.has(quizId)) return false;
  const p = loadDex();
  const prev = p.stats[quizId];
  const isNew = !prev;
  const best = timeMs === null ? (prev?.bestTimeMs ?? null) : prev?.bestTimeMs == null ? timeMs : Math.min(prev.bestTimeMs, timeMs);
  p.stats[quizId] = {
    firstCorrectAt: prev?.firstCorrectAt ?? Date.now(),
    bestTimeMs: best === null ? null : Math.round(best),
    correctCount: (prev?.correctCount ?? 0) + 1,
  };
  if (isNew) p.discovered.push(quizId);
  save(p);
  return isNew;
}

export function onDexChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const DEX_TOTAL = QUIZZES.length;

// ---------------------------------------------------------------- debug helpers (dev builds)

function unlockAll() {
  const p = loadDex();
  const now = Date.now();
  for (const q of QUIZZES) {
    if (p.stats[q.id]) continue;
    p.stats[q.id] = { firstCorrectAt: now, bestTimeMs: 1000 + Math.round(Math.random() * 8000), correctCount: 1 };
    p.discovered.push(q.id);
  }
  save(p);
  return p.discovered.length;
}

function resetAll() {
  save(empty());
}

if (import.meta.env.DEV) {
  const w = window as unknown as { debugUnlockAllDex?: () => number; debugResetDex?: () => void };
  w.debugUnlockAllDex = unlockAll;
  w.debugResetDex = resetAll;
}


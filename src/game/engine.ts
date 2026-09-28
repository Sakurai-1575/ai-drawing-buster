import { sound } from '../audio/SoundManager';
import { ANSWER_INDEX, QUIZZES, quizOptions, type Choices, type Lang, type Quiz } from '../data/quizzes';
import { recordDexCorrect } from './dex';
import { checkAchievements } from '../services/achievements';

export const QUESTIONS_PER_GAME = 10;
export const TIME_LIMIT_MS = 10_000;
export const MAX_POINTS = TIME_LIMIT_MS;
/** Wrong answer: answer lockout in score attack and online matches. The drawing keeps going meanwhile. */
export const PENALTY_MS = 3_000;
/** Score attack: points lost per wrong pick, escalating within a question (1st, 2nd, 3rd miss). */
export const WRONG_SCORE_PENALTIES = [3_000, 4_000, 5_000] as const;
/** Sudden death keeps its old, shorter lock: the life lost is the real penalty. */
export const SUDDEN_PENALTY_MS = 2_000;
export const REVEAL_CORRECT_MS = 1_700;
export const REVEAL_TIMEOUT_MS = 2_400;
/** The AI only reaches this share of the drawing by the time limit; the rest is fast-forwarded on reveal. */
export const DRAW_SHARE = 0.9;
/** Duration of the fast-forward that completes the drawing when a round ends. */
export const REVEAL_DRAW_MS = 200;
/** Answering with at least this much time left is a CRITICAL (GOD SPEED) guess. */
export const CRITICAL_REMAINING_MS = 7_000;
/** Combo bonus: +10% per consecutive correct answer after the first, capped at ×2.0. */
export const COMBO_STEP = 0.1;
export const COMBO_MAX_MULTIPLIER = 2;
/** READY... GO! before the first drawing. Every clock (question timer, time attack, lockouts) waits. */
export const INTRO_MS = 1_000;
/** The GO! part of the intro: its last this-many ms. */
export const INTRO_GO_MS = 400;

// ---------------------------------------------------------------- solo modes

/** score: 10 fixed questions. sudden: 3 lives, endless, speeds up. timeattack: as many as possible in 3 minutes. */
export type SoloMode = 'score' | 'sudden' | 'timeattack';
export const SOLO_MODES: SoloMode[] = ['score', 'sudden', 'timeattack'];

export const SUDDEN_LIVES = 3;
/** Sudden death: after the drawing is decided, how long the answer stays up before GAME OVER. */
export const GAME_OVER_REVEAL_MS = 1_600;
export const TA_DURATION_MS = 180_000;
/** Time attack: tiny pause after a correct answer before the next drawing. */
export const TA_REVEAL_MS = 300;
/** Time attack: a wrong answer freezes input this long (the clock keeps running)… */
export const TA_PENALTY_MS = 2_000;
/** …and confiscates this much of the 3-minute clock. */
export const TA_TIME_PENALTY_MS = 5_000;

/** Sudden death speeds the AI up as you survive: the question clock (drawing + time limit) runs faster. */
export function suddenSpeed(questionIndex: number): number {
  if (questionIndex < 10) return 1;
  if (questionIndex < 20) return 1.15;
  if (questionIndex < 30) return 1.3;
  return 1.5;
}

export type Phase = 'title' | 'playing' | 'result';
export type RoundState = 'drawing' | 'correct' | 'timeout';
export type Rank = 'S' | 'A' | 'B' | 'C';

export interface PreparedQuestion {
  quiz: Quiz;
  /** Shuffled display order: slot i shows option order[i] of `quizOptions`. Language-independent. */
  order: number[];
  /** Display slot of the correct answer. */
  answer: number;
}

/** The four buttons' labels, in display order, for `lang`. */
export function displayChoices(q: PreparedQuestion, lang: Lang): Choices {
  const options = quizOptions(q.quiz, lang);
  return q.order.map((i) => options[i]) as Choices;
}

export interface RoundRecord {
  outcome: 'correct' | 'timeout';
  timeMs: number;
  points: number;
  misses: number;
  critical: boolean;
}

/**
 * Mutable game state. Advanced by the rAF loop and input handlers, then committed
 * to React via a re-render — keeps side effects (sounds) out of React updaters.
 */
export interface GameState {
  mode: SoloMode;
  phase: Phase;
  questions: PreparedQuestion[];
  index: number;
  /** Game-time elapsed in the current question (pauses excluded). */
  elapsed: number;
  round: RoundState;
  revealElapsed: number;
  /** Drawing progress (0–1) when the round ended, the start of the fast-forward. */
  revealFrom: number;
  /** Whether the fast-forwarded drawing has landed yet. */
  revealLanded: boolean;
  /** Remaining penalty lockout after a wrong answer. */
  lockRemaining: number;
  /** Full length of the current lockout (for the countdown bar). */
  lockTotal: number;
  /** Increments on every wrong answer (drives the red flash / penalty popup). */
  penaltyId: number;
  /** What the last wrong answer cost: points (score attack) or ms of clock (time attack); 0 otherwise. */
  lastPenalty: number;
  wrongPicks: number[];
  paused: boolean;
  /** ms left of the READY... GO! intro; 0 once play has started. */
  intro: number;
  score: number;
  lastPoints: number;
  lastMultiplier: number;
  lastCritical: boolean;
  combo: number;
  maxCombo: number;
  /** Combo count that was just lost (for the COMBO BREAK popup). */
  brokenCombo: number;
  comboBreakId: number;
  critId: number;
  records: RoundRecord[];
  lastBeepSecond: number;
  shakeId: number;
  confettiId: number;
  bestScore: number;
  isNewRecord: boolean;
  /** Quiz ids first discovered (Buster Dex) during this game. */
  newDex: string[];
  // --- sudden death / time attack
  lives: number;
  /** Increments when a life is lost (drives the heart-break animation). */
  lifeLostId: number;
  /** Question clock rate (sudden death); 1 otherwise. */
  speed: number;
  /** Time attack: ms left on the 3-minute clock. */
  taRemaining: number;
  taLastBeep: number;
  correctCount: number;
  wrongCount: number;
  /** Game over reached (sudden death): the current reveal is the last thing shown. */
  gameOver: boolean;
  /** Sudden death: answered every quiz without dying. */
  cleared: boolean;
  /** Personal best for this mode: score (score attack) or correct answers (sudden / time attack). */
  modeBest: number;
}

const BEST_KEY = 'adb.bestScore';
/** Personal bests for the other solo modes: most correct answers. */
const MODE_BEST_KEYS: Record<Exclude<SoloMode, 'score'>, string> = { sudden: 'adb.best.sudden', timeattack: 'adb.best.timeattack' };

export function loadModeBest(mode: SoloMode): number {
  if (mode === 'score') return loadBest();
  try {
    return Number(localStorage.getItem(MODE_BEST_KEYS[mode])) || 0;
  } catch {
    return 0;
  }
}

function saveModeBest(mode: Exclude<SoloMode, 'score'>, value: number) {
  try {
    localStorage.setItem(MODE_BEST_KEYS[mode], String(value));
  } catch {
    /* storage unavailable */
  }
}
const TOP_SCORES_KEY = 'adb.topScores';
export const TOP_SCORES_MAX = 5;

export interface ScoreEntry {
  score: number;
  rank: Rank;
  /** Unix ms when the game finished. */
  at: number;
}

export function loadTopScores(): ScoreEntry[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(TOP_SCORES_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is ScoreEntry => typeof e?.score === 'number' && typeof e?.rank === 'string' && typeof e?.at === 'number')
      .slice(0, TOP_SCORES_MAX);
  } catch {
    return [];
  }
}

function saveTopScore(entry: ScoreEntry) {
  const top = [...loadTopScores(), entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, TOP_SCORES_MAX);
  try {
    localStorage.setItem(TOP_SCORES_KEY, JSON.stringify(top));
  } catch {
    /* storage unavailable */
  }
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number) {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    /* storage unavailable */
  }
}

function shuffle<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function prepare(quiz: Quiz): PreparedQuestion {
  const order = shuffle([0, 1, 2, 3]);
  return { quiz, order, answer: order.indexOf(ANSWER_INDEX) };
}

export function createIdleState(): GameState {
  return {
    mode: 'score',
    phase: 'title',
    questions: [],
    index: 0,
    elapsed: 0,
    round: 'drawing',
    revealElapsed: 0,
    revealFrom: 0,
    revealLanded: false,
    lockRemaining: 0,
    lockTotal: PENALTY_MS,
    penaltyId: 0,
    lastPenalty: 0,
    wrongPicks: [],
    paused: false,
    intro: 0,
    score: 0,
    lastPoints: 0,
    lastMultiplier: 1,
    lastCritical: false,
    combo: 0,
    maxCombo: 0,
    brokenCombo: 0,
    comboBreakId: 0,
    critId: 0,
    records: [],
    lastBeepSecond: 4,
    shakeId: 0,
    confettiId: 0,
    bestScore: loadBest(),
    isNewRecord: false,
    newDex: [],
    lives: SUDDEN_LIVES,
    lifeLostId: 0,
    speed: 1,
    taRemaining: TA_DURATION_MS,
    taLastBeep: 11,
    correctCount: 0,
    wrongCount: 0,
    gameOver: false,
    cleared: false,
    modeBest: 0,
  };
}

export function createGame(mode: SoloMode = 'score'): GameState {
  // Score attack: 10 random quizzes. The endless modes walk the whole set without repeats.
  const pool = shuffle(QUIZZES);
  return {
    ...createIdleState(),
    mode,
    phase: 'playing',
    intro: INTRO_MS,
    questions: (mode === 'score' ? pool.slice(0, QUESTIONS_PER_GAME) : pool).map(prepare),
    modeBest: loadModeBest(mode),
  };
}

function resetRound(s: GameState) {
  s.elapsed = 0;
  s.round = 'drawing';
  s.revealElapsed = 0;
  s.revealFrom = 0;
  s.revealLanded = false;
  s.lockRemaining = 0;
  s.wrongPicks = [];
  s.lastBeepSecond = 4;
}

export function comboMultiplier(combo: number): number {
  return Math.min(COMBO_MAX_MULTIPLIER, 1 + COMBO_STEP * Math.max(0, combo - 1));
}

/** Highest possible score: every question answered instantly with an unbroken combo. */
export const MAX_SCORE = Array.from({ length: QUESTIONS_PER_GAME }, (_, i) => Math.round(MAX_POINTS * comboMultiplier(i + 1))).reduce(
  (a, b) => a + b,
  0,
);

/** Drawing progress (0–1) while the AI is still drawing. */
export function drawProgress(elapsed: number): number {
  return (elapsed / TIME_LIMIT_MS) * DRAW_SHARE;
}

/** Mode-aware drawing progress: time attack has no per-question timeout, so the drawing finishes and waits. */
export function drawProgressFor(s: Pick<GameState, 'mode' | 'elapsed'>): number {
  return s.mode === 'timeattack' ? Math.min(1, s.elapsed / TIME_LIMIT_MS) : drawProgress(s.elapsed);
}

/** Sudden death: lose a life; at zero the current reveal becomes the last one. */
function loseLife(s: GameState) {
  s.lives = Math.max(0, s.lives - 1);
  s.lifeLostId++;
  if (s.lives === 0) {
    s.gameOver = true;
    sound.timeUp();
  }
}

function breakCombo(s: GameState) {
  if (s.combo >= 2) {
    s.brokenCombo = s.combo;
    s.comboBreakId++;
    sound.comboBreak();
  }
  s.combo = 0;
}

function beginReveal(s: GameState, round: Exclude<RoundState, 'drawing'>) {
  s.round = round;
  s.revealElapsed = 0;
  s.revealFrom = drawProgressFor(s);
  s.revealLanded = false;
  s.lockRemaining = 0;
}

function finish(s: GameState) {
  s.phase = 'result';
  if (s.mode === 'score') {
    s.isNewRecord = s.score > s.bestScore;
    if (s.isNewRecord) {
      s.bestScore = s.score;
      saveBest(s.score);
    }
    s.modeBest = s.bestScore;
    saveTopScore({ score: s.score, rank: rankFor(s.score), at: Date.now() });
  } else {
    s.isNewRecord = s.correctCount > s.modeBest;
    if (s.isNewRecord) {
      s.modeBest = s.correctCount;
      saveModeBest(s.mode, s.correctCount);
    }
  }
  sound.fanfare();
  checkAchievements({
    type: 'result',
    mode: s.mode,
    correctCount: s.correctCount,
    questions: s.mode === 'score' ? s.questions.length : s.index + 1,
    // Wrong picks and timeouts both count as misses.
    misses: s.wrongCount + s.records.filter((r) => r.outcome === 'timeout').length,
  });
}

function advance(s: GameState) {
  if (s.gameOver) return finish(s);
  if (s.index + 1 >= s.questions.length) {
    if (s.mode === 'score') return finish(s);
    if (s.mode === 'sudden') {
      s.cleared = true; // survived every quiz
      return finish(s);
    }
    // Time attack ran through all quizzes: start another lap, reshuffled.
    s.questions.push(...shuffle(QUIZZES).map(prepare));
  }
  s.index++;
  resetRound(s);
  if (s.mode === 'sudden') s.speed = suddenSpeed(s.index);
}

/** Advance game time by dt ms. Returns true when the state changed. */
export function step(s: GameState, dt: number): boolean {
  if (s.phase !== 'playing' || s.paused) return false;

  // READY... GO!: nothing else moves until it's over.
  if (s.intro > 0) {
    const wasReady = s.intro > INTRO_GO_MS;
    s.intro = Math.max(0, s.intro - dt);
    if (wasReady && s.intro <= INTRO_GO_MS) sound.go();
    return true;
  }

  // Time attack: one 3-minute clock over everything (drawing and reveals alike).
  if (s.mode === 'timeattack') {
    s.taRemaining = Math.max(0, s.taRemaining - dt);
    const secs = Math.ceil(s.taRemaining / 1000);
    if (secs >= 1 && secs <= 10 && secs < s.taLastBeep) {
      s.taLastBeep = secs;
      sound.countdown(secs);
    }
    if (s.taRemaining <= 0) {
      sound.timeUp();
      finish(s);
      return true;
    }
  }

  if (s.round === 'drawing') {
    // Sudden death runs the question clock faster as you survive (drawing and limit together).
    const rate = s.mode === 'sudden' ? s.speed : 1;
    s.elapsed = Math.min(TIME_LIMIT_MS, s.elapsed + dt * rate);
    s.lockRemaining = Math.max(0, s.lockRemaining - dt);
    if (s.mode === 'timeattack') return true; // no per-question limit: the drawing waits for you

    const secondsLeft = Math.ceil((TIME_LIMIT_MS - s.elapsed) / 1000);
    if (secondsLeft >= 1 && secondsLeft <= 3 && secondsLeft < s.lastBeepSecond) {
      s.lastBeepSecond = secondsLeft;
      sound.countdown(secondsLeft);
    }

    if (s.elapsed >= TIME_LIMIT_MS) {
      beginReveal(s, 'timeout');
      s.lastPoints = 0;
      s.records.push({ outcome: 'timeout', timeMs: TIME_LIMIT_MS, points: 0, misses: s.wrongPicks.length, critical: false });
      sound.timeUp();
      sound.sweep();
      breakCombo(s);
      if (s.mode === 'sudden') loseLife(s);
    }
    return true;
  }

  s.revealElapsed += dt;
  if (!s.revealLanded && s.revealElapsed >= REVEAL_DRAW_MS) {
    s.revealLanded = true;
    if (s.round === 'timeout') sound.slam();
  }
  let revealFor = s.round === 'correct' ? REVEAL_CORRECT_MS : REVEAL_TIMEOUT_MS;
  if (s.mode === 'timeattack' && s.round === 'correct') revealFor = TA_REVEAL_MS;
  if (s.gameOver) revealFor = GAME_OVER_REVEAL_MS;
  if (s.revealElapsed >= revealFor) advance(s);
  return true;
}

export function canAnswer(s: GameState, choice?: number): boolean {
  return (
    s.phase === 'playing' &&
    !s.paused &&
    s.intro <= 0 &&
    s.round === 'drawing' &&
    s.lockRemaining <= 0 &&
    (choice === undefined || !s.wrongPicks.includes(choice))
  );
}

/** Returns true when the state changed. */
export function submitAnswer(s: GameState, choice: number): boolean {
  if (!canAnswer(s, choice)) return false;
  const q = s.questions[s.index];

  if (choice === q.answer) {
    const remaining = TIME_LIMIT_MS - s.elapsed;
    const critical = remaining >= CRITICAL_REMAINING_MS;
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    s.correctCount++;
    const multiplier = comboMultiplier(s.combo);
    // Score attack: remaining ms × combo. Sudden death also pays for speed. Time attack: flat 1,000 + speed bonus, × combo.
    const base = s.mode === 'timeattack' ? 1000 + Math.max(0, remaining) / 10 : Math.ceil(remaining) * (s.mode === 'sudden' ? s.speed : 1);
    const points = Math.round(base * multiplier);
    s.score += points;
    s.lastPoints = points;
    s.lastMultiplier = multiplier;
    s.lastCritical = critical;
    beginReveal(s, 'correct');
    s.confettiId++;
    s.records.push({ outcome: 'correct', timeMs: s.elapsed, points, misses: s.wrongPicks.length, critical });
    if (recordDexCorrect(q.quiz.id, s.elapsed)) {
      s.newDex.push(q.quiz.id);
      checkAchievements({ type: 'dex' });
    }
    checkAchievements({
      type: 'answer',
      mode: s.mode,
      correct: true,
      timeMs: s.elapsed,
      remainingMs: s.mode === 'timeattack' ? null : remaining,
      combo: s.combo,
      correctCount: s.correctCount,
    });
    if (critical) {
      s.critId++;
      sound.critical(s.combo);
    } else {
      sound.correct(s.combo);
    }
  } else {
    s.wrongPicks.push(choice);
    s.wrongCount++;
    s.lockTotal = s.mode === 'timeattack' ? TA_PENALTY_MS : s.mode === 'sudden' ? SUDDEN_PENALTY_MS : PENALTY_MS;
    s.lockRemaining = s.lockTotal;
    s.lastPenalty = 0;
    if (s.mode === 'score') {
      // Escalates with each miss on the same question; the total never drops below 0.
      s.lastPenalty = WRONG_SCORE_PENALTIES[Math.min(s.wrongPicks.length, WRONG_SCORE_PENALTIES.length) - 1];
      s.score = Math.max(0, s.score - s.lastPenalty);
    } else if (s.mode === 'timeattack') {
      // Clock confiscation; if this empties it, the next step() ends the run.
      s.lastPenalty = Math.min(s.taRemaining, TA_TIME_PENALTY_MS);
      s.taRemaining -= s.lastPenalty;
    }
    s.penaltyId++;
    s.shakeId++;
    sound.wrong();
    checkAchievements({ type: 'answer', mode: s.mode, correct: false, timeMs: s.elapsed, remainingMs: null });
    breakCombo(s);
    if (s.mode === 'sudden') {
      loseLife(s);
      if (s.gameOver) {
        // Out of lives: reveal the answer, then GAME OVER.
        beginReveal(s, 'timeout');
        s.records.push({ outcome: 'timeout', timeMs: s.elapsed, points: 0, misses: s.wrongPicks.length, critical: false });
      }
    }
  }
  return true;
}

/** Mean time to a correct answer (ms), or null. */
export function averageCorrectTime(records: RoundRecord[]): number | null {
  const times = records.filter((r) => r.outcome === 'correct').map((r) => r.timeMs);
  return times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
}

export function rankFor(score: number): Rank {
  const ratio = score / MAX_SCORE;
  if (ratio >= 0.7) return 'S';
  if (ratio >= 0.5) return 'A';
  if (ratio >= 0.3) return 'B';
  return 'C';
}

export function fastestTime(records: RoundRecord[]): number | null {
  const times = records.filter((r) => r.outcome === 'correct').map((r) => r.timeMs);
  return times.length ? Math.min(...times) : null;
}


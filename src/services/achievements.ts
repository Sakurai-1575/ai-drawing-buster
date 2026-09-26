/**
 * Achievements. Web build: persisted in localStorage. Steam build: the platform hook in
 * `unlockAchievement` forwards each unlock to Steamworks (ids match the Steamworks API names).
 *
 * Game code never unlocks directly — it reports what happened via `checkAchievements(event)`,
 * and the rules below decide. UI subscribes with `onAchievementUnlocked` (toasts) / `onAchievementsChange`.
 */
import type { Localized } from '../data/quizzes';
import { QUIZZES } from '../data/quizzes';
import { GENRES } from '../data/genres';
import { loadDex } from '../game/dex';
import type { SoloMode } from '../game/engine';

export type AchievementId =
  | 'FIRST_STEP'
  | 'PERFECT_RUN'
  | 'SPEED_DEMON'
  | 'COMBO_MASTER'
  | 'FELL_FOR_IT'
  | 'SURVIVOR_10'
  | 'SURVIVOR_30'
  | 'RAPID_FIRE'
  | 'RAPID_MASTER'
  | 'GENRE_ALL'
  | 'DEX_ROOKIE'
  | 'DEX_EXPERT'
  | 'DEX_MASTER'
  | 'BUSTER_FAN'
  | 'CLUTCH_WIN';

export interface Achievement {
  id: AchievementId;
  title: Localized<string>;
  description: Localized<string>;
  /** Emoji (or inline SVG markup). */
  icon: string;
  /** Hidden achievement: title/description show as ??? until unlocked. */
  isSecret?: boolean;
}

export const SPEED_DEMON_MS = 800;
export const COMBO_MASTER_COMBO = 10;
export const FELL_FOR_IT_COUNT = 10;
export const BUSTER_FAN_CLICKS = 10;
export const CLUTCH_REMAINING_MS = 500;

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'FIRST_STEP',
    icon: '👣',
    title: { ja: 'はじめの一歩', en: 'First Step' },
    description: { ja: 'いずれかのモードで初めてゲームをクリアする', en: 'Finish a game in any mode for the first time' },
  },
  {
    id: 'PERFECT_RUN',
    icon: '💎',
    title: { ja: '騙されない心', en: 'Unfooled' },
    description: { ja: 'スコアアタック（10問）をノーミスでクリアする', en: 'Clear Score Attack with no misses' },
  },
  {
    id: 'SPEED_DEMON',
    icon: '⚡',
    title: { ja: '神速のエスパー', en: 'Speed Demon' },
    description: { ja: '0.8秒未満で正解する', en: 'Answer correctly in under 0.8 seconds' },
  },
  {
    id: 'COMBO_MASTER',
    icon: '🔥',
    title: { ja: 'コンボの達人', en: 'Combo Master' },
    description: { ja: '1回のゲームで10連続コンボを達成する', en: 'Reach a 10-answer combo in one game' },
  },
  {
    id: 'FELL_FOR_IT',
    icon: '🎣',
    title: { ja: 'まんまと引っかかった', en: 'Fell For It' },
    description: { ja: 'ミスリードの選択肢を累計10回選ぶ', en: 'Pick a decoy answer 10 times in total' },
  },
  {
    id: 'SURVIVOR_10',
    icon: '❤️',
    title: { ja: '生き残り屋', en: 'Survivor' },
    description: { ja: 'サドンデスで10問突破する', en: 'Get 10 correct in Sudden Death' },
  },
  {
    id: 'SURVIVOR_30',
    icon: '💥',
    title: { ja: '限界突破', en: 'Beyond the Limit' },
    description: { ja: 'サドンデスで30問突破し、1.5倍速に到達する', en: 'Get 30 correct in Sudden Death and reach 1.5x speed' },
  },
  {
    id: 'RAPID_FIRE',
    icon: '🌪️',
    title: { ja: '嵐の回答ラッシュ', en: 'Rapid Fire' },
    description: { ja: 'タイムアタックで20問以上正解する', en: 'Get 20 or more correct in Time Attack' },
  },
  {
    id: 'RAPID_MASTER',
    icon: '🚀',
    title: { ja: '音速の回答マシン', en: 'Sonic Answer Machine' },
    description: { ja: 'タイムアタックで30問以上正解する', en: 'Get 30 or more correct in Time Attack' },
  },
  {
    id: 'GENRE_ALL',
    icon: '🌈',
    title: { ja: '雑学王', en: 'Trivia King' },
    description: { ja: '全7ジャンルのお題を、各ジャンル1問以上正解する', en: 'Solve at least one quiz in each of the 7 genres' },
  },
  {
    id: 'DEX_ROOKIE',
    icon: '📗',
    title: { ja: '見習いコレクター', en: 'Rookie Collector' },
    description: { ja: '図鑑に25問登録する', en: 'Register 25 entries in the Buster Dex' },
  },
  {
    id: 'DEX_EXPERT',
    icon: '📘',
    title: { ja: '熟練コレクター', en: 'Expert Collector' },
    description: { ja: '図鑑に100問登録する', en: 'Register 100 entries in the Buster Dex' },
  },
  {
    id: 'DEX_MASTER',
    icon: '👑',
    title: { ja: '図鑑コンプリート！', en: 'Dex Complete!' },
    description: { ja: `図鑑に全${QUIZZES.length}問を登録する`, en: `Register all ${QUIZZES.length} Buster Dex entries` },
  },
  {
    id: 'BUSTER_FAN',
    icon: '🐾',
    title: { ja: 'なでなで', en: 'Head Pats' },
    description: { ja: 'タイトル画面でバスターくんを累計10回クリックする', en: 'Click Buster-kun on the title screen 10 times in total' },
  },
  {
    id: 'CLUTCH_WIN',
    icon: '⏳',
    isSecret: true,
    title: { ja: '危機一髪', en: 'Clutch Win' },
    description: { ja: '残り時間0.5秒未満で正解する', en: 'Answer correctly with under 0.5 seconds left' },
  },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

// ---------------------------------------------------------------- events (what the game reports)

export type AchievementEvent =
  /** Any timed answer (Solo modes, online Mode A). `timeMs` is on the question clock. */
  | {
      type: 'answer';
      mode: SoloMode | 'online';
      correct: boolean;
      timeMs: number;
      /** Time left on the question clock; null when there's no per-question limit (time attack). */
      remainingMs: number | null;
      /** Current combo after this answer (solo only). */
      combo?: number;
      /** Correct answers so far this game (solo only). */
      correctCount?: number;
    }
  /** A game reached its result screen. */
  | { type: 'result'; mode: SoloMode | 'online'; correctCount: number; questions: number; misses: number }
  /** Buster Dex changed (a new entry). */
  | { type: 'dex' }
  /** Title screen: Buster-kun was clicked. */
  | { type: 'busterClick' };

// ---------------------------------------------------------------- storage

const KEY = 'adb.achievements';

interface AchievementSave {
  version: 1;
  /** id → unix ms of the unlock. */
  unlocked: Partial<Record<AchievementId, number>>;
  /** Cumulative counters for multi-step achievements. */
  counters: { decoyPicks: number; busterClicks: number };
}

const empty = (): AchievementSave => ({ version: 1, unlocked: {}, counters: { decoyPicks: 0, busterClicks: 0 } });

export function loadAchievements(): AchievementSave {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as AchievementSave | null;
    if (!raw || raw.version !== 1 || typeof raw.unlocked !== 'object') return empty();
    const unlocked = Object.fromEntries(Object.entries(raw.unlocked).filter(([id, at]) => ACHIEVEMENT_BY_ID.has(id as AchievementId) && typeof at === 'number'));
    return {
      version: 1,
      unlocked,
      counters: { decoyPicks: Number(raw.counters?.decoyPicks) || 0, busterClicks: Number(raw.counters?.busterClicks) || 0 },
    };
  } catch {
    return empty();
  }
}

function save(data: AchievementSave) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable */
  }
  changeListeners.forEach((fn) => fn());
}

// ---------------------------------------------------------------- subscriptions

const unlockListeners = new Set<(a: Achievement) => void>();
const changeListeners = new Set<() => void>();

/** Fires once per new unlock (drives the toast). */
export function onAchievementUnlocked(fn: (a: Achievement) => void): () => void {
  unlockListeners.add(fn);
  return () => void unlockListeners.delete(fn);
}

/** Fires on any save (unlocks and counters) — for progress displays. */
export function onAchievementsChange(fn: () => void): () => void {
  changeListeners.add(fn);
  return () => void changeListeners.delete(fn);
}

// ---------------------------------------------------------------- unlock

declare global {
  interface Window {
    /** Injected by the Steam (desktop) build; absent on the web. */
    __STEAMWORKS__?: { unlockAchievement(id: string): void };
  }
}

/** Unlock once: persist, forward to the platform, notify the UI. No-op if already unlocked or unknown. */
export function unlockAchievement(id: string): void {
  const achievement = ACHIEVEMENT_BY_ID.get(id as AchievementId);
  if (!achievement) return;
  const data = loadAchievements();
  if (data.unlocked[achievement.id]) return;
  data.unlocked[achievement.id] = Date.now();
  save(data);
  // TODO: if (window.__STEAMWORKS__) window.__STEAMWORKS__.unlockAchievement(id);
  unlockListeners.forEach((fn) => fn(achievement));
}

export function isUnlocked(id: AchievementId): boolean {
  return !!loadAchievements().unlocked[id];
}

// ---------------------------------------------------------------- rules

function checkDex() {
  const { discovered } = loadDex();
  const n = discovered.length;
  if (n >= 25) unlockAchievement('DEX_ROOKIE');
  if (n >= 100) unlockAchievement('DEX_EXPERT');
  if (n >= QUIZZES.length) unlockAchievement('DEX_MASTER');
  const found = new Set(discovered);
  const genres = new Set(QUIZZES.filter((q) => found.has(q.id)).map((q) => q.genre));
  if (GENRES.every((g) => genres.has(g))) unlockAchievement('GENRE_ALL');
}

function bumpCounter(key: keyof AchievementSave['counters']): number {
  const data = loadAchievements();
  data.counters[key]++;
  save(data);
  return data.counters[key];
}

/** Report something that happened; unlocks whatever it earns. Safe to call often. */
export function checkAchievements(event: AchievementEvent): void {
  switch (event.type) {
    case 'answer': {
      if (!event.correct) {
        // Every wrong choice is one of the quiz's hand-picked decoys.
        if (bumpCounter('decoyPicks') >= FELL_FOR_IT_COUNT) unlockAchievement('FELL_FOR_IT');
        return;
      }
      if (event.timeMs < SPEED_DEMON_MS) unlockAchievement('SPEED_DEMON');
      if (event.remainingMs !== null && event.remainingMs < CLUTCH_REMAINING_MS) unlockAchievement('CLUTCH_WIN');
      if ((event.combo ?? 0) >= COMBO_MASTER_COMBO) unlockAchievement('COMBO_MASTER');
      const correct = event.correctCount ?? 0;
      if (event.mode === 'sudden') {
        if (correct >= 10) unlockAchievement('SURVIVOR_10');
        if (correct >= 30) unlockAchievement('SURVIVOR_30'); // Q31 onward runs at 1.5x
      }
      if (event.mode === 'timeattack') {
        if (correct >= 20) unlockAchievement('RAPID_FIRE');
        if (correct >= 30) unlockAchievement('RAPID_MASTER');
      }
      return;
    }
    case 'result':
      if (event.correctCount > 0) unlockAchievement('FIRST_STEP');
      if (event.mode === 'score' && event.misses === 0 && event.correctCount === event.questions) unlockAchievement('PERFECT_RUN');
      return;
    case 'dex':
      return checkDex();
    case 'busterClick':
      if (bumpCounter('busterClicks') >= BUSTER_FAN_CLICKS) unlockAchievement('BUSTER_FAN');
      return;
  }
}

// ---------------------------------------------------------------- debug helpers (dev builds)

if (import.meta.env.DEV) {
  const w = window as unknown as { debugUnlockAchievement?: (id: string) => void; debugResetAchievements?: () => void };
  w.debugUnlockAchievement = unlockAchievement;
  w.debugResetAchievements = () => save(empty());
}

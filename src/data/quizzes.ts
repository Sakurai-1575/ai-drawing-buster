/**
 * The quiz list and the helpers that read it. The data itself lives in ./quizzesVol1–3
 * (plain data that depends only on ./shapes and ./quizTypes), so it can sit in its own
 * chunks without any import pointing back here.
 */
import { localize, resolveLang, type Lang } from '../i18n/lang';
import type { Choices, PackLang, Quiz, QuizTranslations } from './quizTypes';
import { QUIZZES_VOL1 } from './quizzesVol1';
import { QUIZZES_VOL2 } from './quizzesVol2';
import { QUIZZES_VOL3 } from './quizzesVol3';

export * from './quizTypes';

/**
 * The language a quiz's answer and decoys are actually shown in for `lang`. Label and decoys
 * always fall back together — mixing languages would make the answer stand out.
 */
export function quizLang(quiz: Quiz, lang: Lang): Lang {
  return resolveLang(lang, (l) => quiz.label[l] !== undefined && quiz.misleads[l] !== undefined);
}

export function quizLabel(quiz: Quiz, lang: Lang): string {
  return quiz.label[quizLang(quiz, lang)]!;
}

/** Answer + decoys in `lang` (answer at ANSWER_INDEX). */
export function quizOptions(quiz: Quiz, lang: Lang): Choices {
  const l = quizLang(quiz, lang);
  return [quiz.label[l]!, ...quiz.misleads[l]!];
}

export function quizComment(quiz: Quiz, lang: Lang): string {
  return localize(quiz.comment, lang);
}

/**
 * Every quiz: 1–200 in `./quizzesVol1`, 201–300 in `./quizzesVol2`, 301–500 in `./quizzesVol3`.
 * Only `ja` + `en` text ships with the data; `loadQuizText` (./quizI18n) merges other languages
 * in when they're first needed.
 */
export const QUIZZES: Quiz[] = [...QUIZZES_VOL1, ...QUIZZES_VOL2, ...QUIZZES_VOL3];

/** Merge one language's translation pack into QUIZZES (called by ./quizI18n once the pack has loaded). */
export function applyQuizTranslations(lang: PackLang, pack: QuizTranslations): void {
  const byId = new Map(QUIZZES.map((q) => [q.id, q]));
  for (const [id, text] of Object.entries(pack)) {
    const quiz = byId.get(id);
    if (!quiz) {
      if (import.meta.env?.DEV) console.warn(`[i18n] ${lang}: no quiz with id "${id}"`);
      continue;
    }
    quiz.label[lang] = text.label;
    quiz.misleads[lang] = text.misleads;
    quiz.comment[lang] = text.comment;
  }
  // New quizzes must ship translated: players would otherwise see them in English.
  const missing = QUIZZES.filter((q) => !pack[q.id]).map((q) => q.id);
  if (missing.length && import.meta.env?.DEV) console.warn(`[i18n] ${lang}: ${missing.length} untranslated quizzes (${missing.join(', ')})`);
}


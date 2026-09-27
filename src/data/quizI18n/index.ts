/**
 * On-demand quiz translations. Each non-base language is its own chunk, fetched the first time
 * that language is needed (startup language, a language switch, or hosting a multiplayer room
 * whose guests may play in any language).
 */
import { LANGS, type Lang } from '../../i18n/lang';
import { applyQuizTranslations, type PackLang, type QuizTranslations } from '../quizzes';

const PACKS: Record<PackLang, () => Promise<QuizTranslations>> = {
  'zh-CN': () => import('./zh-CN').then((m) => m.QUIZ_ZH_CN),
  'zh-TW': () => import('./zh-TW').then((m) => m.QUIZ_ZH_TW),
  ko: () => import('./ko').then((m) => m.QUIZ_KO),
};

const loading = new Map<PackLang, Promise<void>>();

/** Resolves once `lang`'s quiz text is merged into QUIZZES (instant for ja / en, which ship built in). */
export function loadQuizText(lang: Lang): Promise<void> {
  if (lang === 'ja' || lang === 'en') return Promise.resolve();
  let p = loading.get(lang);
  if (!p) {
    p = PACKS[lang]().then((pack) => applyQuizTranslations(lang, pack));
    // Let a failed fetch (e.g. offline web build) be retried next time.
    p.catch(() => loading.delete(lang));
    loading.set(lang, p);
  }
  return p;
}

export function loadAllQuizText(): Promise<void> {
  return Promise.all(LANGS.map(loadQuizText)).then(() => undefined);
}

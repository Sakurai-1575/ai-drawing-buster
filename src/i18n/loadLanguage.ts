import { loadQuizText } from '../data/quizI18n';
import { loadStrings } from '.';
import type { Lang } from './lang';

/** Everything a language needs before the UI switches to it: its UI strings and its quiz text. */
export function loadLanguage(lang: Lang): Promise<void> {
  return Promise.all([loadStrings(lang), loadQuizText(lang)]).then(() => undefined);
}

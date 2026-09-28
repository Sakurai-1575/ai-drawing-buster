/**
 * Quiz types and constants. Dependency-free (type-only imports), so the quiz data files and
 * the translation packs can use them without pulling in anything else.
 */
import type { MascotExpression } from '../mascotLines';
import type { BaseLang, Lang, Localized } from '../i18n/lang';
import type { Genre } from './genres';
import type { Point, Stroke } from './shapes';

export type { Lang, Localized, Point, Stroke };

export type Decoys = [string, string, string];
/** The four options: the answer first, then the three decoys. Display order is shuffled separately. */
export type Choices = [string, string, string, string];

/** Index of the answer in `quizOptions` — always the label. */
export const ANSWER_INDEX = 0;

export interface Quiz {
  id: string;
  genre: Genre;
  /** The correct answer. */
  label: Localized<string>;
  /** Three wrong options — things the early strokes are meant to look like. */
  misleads: Localized<Decoys>;
  /** Buster Dex: Buster-kun's comment once discovered — sore-loser snark, then a soft, cute aside. */
  comment: Localized<string>;
  /** Buster-kun's face next to the comment. */
  dexMood: MascotExpression;
  strokes: Stroke[];
}

/** One quiz's text in one language (translation packs in `./quizI18n/`). */
export interface QuizText {
  label: string;
  misleads: Decoys;
  comment: string;
}

/** Quiz id → translation. Unknown ids are reported in dev builds. */
export type QuizTranslations = Record<string, QuizText>;

/** Languages whose quiz text lives in a lazily loaded pack (`./quizI18n/<lang>.ts`). */
export type PackLang = Exclude<Lang, BaseLang>;


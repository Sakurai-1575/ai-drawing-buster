import type { Localized } from './quizzes';

/** Topic genres, shared by the AI quizzes (Solo / Mode A / Mode B) and Mode B's draw-only topics. */
export const GENRES = ['animal', 'creature', 'food', 'plant', 'vehicle', 'building', 'item'] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, Localized<string>> = {
  animal: { ja: '🐾 どうぶつ', en: '🐾 Animals' },
  creature: { ja: '🐞 むし・うみのいきもの', en: '🐞 Bugs & sea life' },
  food: { ja: '🍙 たべもの', en: '🍙 Food' },
  plant: { ja: '🌷 しょくぶつ・しぜん', en: '🌷 Plants & nature' },
  vehicle: { ja: '🚗 のりもの', en: '🚗 Vehicles' },
  building: { ja: '🏰 たてもの・ばしょ', en: '🏰 Buildings & places' },
  item: { ja: '🔑 にちようひん・どうぐ', en: '🔑 Everyday items & tools' },
};

/** Short tab labels (Buster Dex filter tabs). */
export const GENRE_SHORT: Record<Genre, Localized<string>> = {
  animal: { ja: '🐾 どうぶつ', en: '🐾 Animals' },
  creature: { ja: '🐞 むし・うみ', en: '🐞 Bugs & sea' },
  food: { ja: '🍙 たべもの', en: '🍙 Food' },
  plant: { ja: '🌷 しょくぶつ', en: '🌷 Plants' },
  vehicle: { ja: '🚗 のりもの', en: '🚗 Vehicles' },
  building: { ja: '🏰 たてもの', en: '🏰 Buildings' },
  item: { ja: '🔑 どうぐ', en: '🔑 Items' },
};

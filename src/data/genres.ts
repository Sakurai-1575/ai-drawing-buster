import type { FullyLocalized } from '../i18n/lang';

/** Topic genres, shared by the AI quizzes (Solo / Mode A / Mode B) and Mode B's draw-only topics. */
export const GENRES = ['animal', 'creature', 'food', 'plant', 'vehicle', 'building', 'item', 'fashion', 'fantasy', 'culture'] as const;
export type Genre = (typeof GENRES)[number];

export const GENRE_LABELS: Record<Genre, FullyLocalized<string>> = {
  animal: { ja: '🐾 どうぶつ', en: '🐾 Animals', 'zh-CN': '🐾 动物', 'zh-TW': '🐾 動物', ko: '🐾 동물' },
  creature: { ja: '🐞 むし・うみのいきもの', en: '🐞 Bugs & sea life', 'zh-CN': '🐞 昆虫·海洋生物', 'zh-TW': '🐞 昆蟲·海洋生物', ko: '🐞 곤충·바다 생물' },
  food: { ja: '🍙 たべもの', en: '🍙 Food', 'zh-CN': '🍙 食物', 'zh-TW': '🍙 食物', ko: '🍙 음식' },
  plant: { ja: '🌷 しょくぶつ・しぜん', en: '🌷 Plants & nature', 'zh-CN': '🌷 植物·自然', 'zh-TW': '🌷 植物·自然', ko: '🌷 식물·자연' },
  vehicle: { ja: '🚗 のりもの', en: '🚗 Vehicles', 'zh-CN': '🚗 交通工具', 'zh-TW': '🚗 交通工具', ko: '🚗 탈것' },
  building: { ja: '🏰 たてもの・ばしょ', en: '🏰 Buildings & places', 'zh-CN': '🏰 建筑·场所', 'zh-TW': '🏰 建築·場所', ko: '🏰 건물·장소' },
  item: { ja: '🔑 にちようひん・どうぐ', en: '🔑 Everyday items & tools', 'zh-CN': '🔑 日用品·工具', 'zh-TW': '🔑 日用品·工具', ko: '🔑 생활용품·도구' },
  fashion: { ja: '👟 ファッション', en: '👟 Fashion', 'zh-CN': '👟 服饰', 'zh-TW': '👟 服飾', ko: '👟 패션' },
  fantasy: { ja: '🪄 ファンタジー・SF', en: '🪄 Fantasy & sci-fi', 'zh-CN': '🪄 奇幻·科幻', 'zh-TW': '🪄 奇幻·科幻', ko: '🪄 판타지·SF' },
  culture: { ja: '🗺️ せかいの文化・名所', en: '🗺️ World culture & landmarks', 'zh-CN': '🗺️ 世界文化·名胜', 'zh-TW': '🗺️ 世界文化·名勝', ko: '🗺️ 세계 문화·명소' },
};

/** Short tab labels (Buster Dex filter tabs). */
export const GENRE_SHORT: Record<Genre, FullyLocalized<string>> = {
  animal: { ja: '🐾 どうぶつ', en: '🐾 Animals', 'zh-CN': '🐾 动物', 'zh-TW': '🐾 動物', ko: '🐾 동물' },
  creature: { ja: '🐞 むし・うみ', en: '🐞 Bugs & sea', 'zh-CN': '🐞 虫·海', 'zh-TW': '🐞 蟲·海', ko: '🐞 곤충·바다' },
  food: { ja: '🍙 たべもの', en: '🍙 Food', 'zh-CN': '🍙 食物', 'zh-TW': '🍙 食物', ko: '🍙 음식' },
  plant: { ja: '🌷 しょくぶつ', en: '🌷 Plants', 'zh-CN': '🌷 植物', 'zh-TW': '🌷 植物', ko: '🌷 식물' },
  vehicle: { ja: '🚗 のりもの', en: '🚗 Vehicles', 'zh-CN': '🚗 交通', 'zh-TW': '🚗 交通', ko: '🚗 탈것' },
  building: { ja: '🏰 たてもの', en: '🏰 Buildings', 'zh-CN': '🏰 建筑', 'zh-TW': '🏰 建築', ko: '🏰 건물' },
  item: { ja: '🔑 どうぐ', en: '🔑 Items', 'zh-CN': '🔑 工具', 'zh-TW': '🔑 工具', ko: '🔑 도구' },
  fashion: { ja: '👟 ファッション', en: '👟 Fashion', 'zh-CN': '👟 服饰', 'zh-TW': '👟 服飾', ko: '👟 패션' },
  fantasy: { ja: '🪄 ファンタジー', en: '🪄 Fantasy', 'zh-CN': '🪄 奇幻', 'zh-TW': '🪄 奇幻', ko: '🪄 판타지' },
  culture: { ja: '🗺️ 文化・名所', en: '🗺️ Culture', 'zh-CN': '🗺️ 文化', 'zh-TW': '🗺️ 文化', ko: '🗺️ 문화' },
};


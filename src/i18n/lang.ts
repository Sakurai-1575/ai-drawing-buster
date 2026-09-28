/**
 * Supported languages and the fallback rules every piece of localized data goes through.
 *
 * UI strings (`STRINGS`) are complete for every language — the compiler enforces it. Content
 * (quizzes, Mode B topics) only guarantees `ja` and `en`; other languages are filled in as
 * translations land, and anything missing falls back along `FALLBACK`.
 */

export const LANGS = ['ja', 'en', 'zh-CN', 'zh-TW', 'ko'] as const;
export type Lang = (typeof LANGS)[number];

/** Languages the content data must always have. */
export type BaseLang = 'ja' | 'en';

/** Content text: `ja` + `en` always present, the rest optional until translated. */
export type Localized<T> = { [L in BaseLang]: T } & { [L in Exclude<Lang, BaseLang>]?: T };

/** Text that must exist in every language (UI labels, achievements, genres). */
export type FullyLocalized<T> = Record<Lang, T>;

/** Selector labels, written in their own language so everyone can find theirs. */
export const LANG_NAMES: Record<Lang, string> = {
  ja: '日本語',
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ko: '한국어',
};

/** Compact labels for tight spots (the title screen's language chip). */
export const LANG_SHORT: Record<Lang, string> = {
  ja: '日本語',
  en: 'EN',
  'zh-CN': '简体',
  'zh-TW': '繁體',
  ko: '한국어',
};

/**
 * Where to look when a language is missing. English first for everyone but Japanese players:
 * it's the most widely read, and Chinese readers shouldn't get Japanese kanji that look
 * like — but aren't — their own words.
 */
const FALLBACK: Record<Lang, readonly Lang[]> = {
  ja: ['ja', 'en'],
  en: ['en', 'ja'],
  'zh-CN': ['zh-CN', 'en', 'ja'],
  'zh-TW': ['zh-TW', 'en', 'ja'],
  ko: ['ko', 'en', 'ja'],
};

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

/** The first language in `lang`'s fallback chain that `has` accepts (always ends at a base language). */
export function resolveLang(lang: Lang, has: (l: Lang) => boolean): Lang {
  return FALLBACK[lang].find(has) ?? 'en';
}

/** Pick `lang` from a localized value, falling back when it isn't translated yet. */
export function localize<T>(text: Localized<T>, lang: Lang): T {
  return text[resolveLang(lang, (l) => text[l] !== undefined)] as T;
}

/** Best match for the browser/OS language list (e.g. navigator.languages). */
export function detectLang(tags: readonly string[]): Lang {
  for (const raw of tags) {
    const tag = raw.toLowerCase();
    if (tag.startsWith('ja')) return 'ja';
    if (tag.startsWith('ko')) return 'ko';
    if (tag.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN';
    if (tag.startsWith('en')) return 'en';
  }
  return 'en';
}


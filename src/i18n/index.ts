import type { Lang } from './lang';
import { ja, type Dict } from './strings/ja';

export * from './lang';
export type { Dict };

/**
 * UI strings. Japanese (the source dictionary) is built in; every other language is its own
 * chunk, loaded by `loadStrings` before the UI switches to it (see `loadLanguage`).
 */
const LOADERS: Record<Exclude<Lang, 'ja'>, () => Promise<Dict>> = {
  en: () => import('./strings/en').then((m) => m.en),
  'zh-CN': () => import('./strings/zh-CN').then((m) => m.zhCN),
  'zh-TW': () => import('./strings/zh-TW').then((m) => m.zhTW),
  ko: () => import('./strings/ko').then((m) => m.ko),
};

const loaded: Partial<Record<Lang, Dict>> = { ja };
const loading = new Map<Lang, Promise<void>>();

export function loadStrings(lang: Lang): Promise<void> {
  if (lang === 'ja' || loaded[lang]) return Promise.resolve();
  let p = loading.get(lang);
  if (!p) {
    p = LOADERS[lang]().then((dict) => {
      loaded[lang] = dict;
    });
    p.catch(() => loading.delete(lang));
    loading.set(lang, p);
  }
  return p;
}

/** The UI dictionary for `lang` — Japanese until that language has been loaded. */
export function getStrings(lang: Lang): Dict {
  return loaded[lang] ?? ja;
}

/** Fill `{name}`-style placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

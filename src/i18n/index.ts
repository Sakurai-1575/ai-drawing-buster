import type { FullyLocalized } from './lang';
import { ja, type Dict } from './strings/ja';
import { en } from './strings/en';
import { zhCN } from './strings/zh-CN';
import { zhTW } from './strings/zh-TW';
import { ko } from './strings/ko';

export * from './lang';
export type { Dict };

export const STRINGS: FullyLocalized<Dict> = { ja, en, 'zh-CN': zhCN, 'zh-TW': zhTW, ko };

/** Fill `{name}`-style placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

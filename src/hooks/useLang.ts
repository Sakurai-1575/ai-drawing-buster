import { useCallback, useState } from 'react';
import type { Lang } from '../data/quizzes';

const KEY = 'adb.lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'ja' || v === 'en') return v;
  } catch {
    /* storage unavailable */
  }
  return navigator.language.startsWith('ja') ? 'ja' : 'en';
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(readLang);
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
  }, []);
  return [lang, setLang] as const;
}

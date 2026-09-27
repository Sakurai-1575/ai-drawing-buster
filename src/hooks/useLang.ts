import { useCallback, useState } from 'react';
import { detectLang, isLang, type Lang } from '../i18n/lang';

const KEY = 'adb.lang';

function readLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (isLang(v)) return v;
  } catch {
    /* storage unavailable */
  }
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
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

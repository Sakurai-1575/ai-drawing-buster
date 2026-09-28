import { useCallback, useRef, useState } from 'react';
import { loadLanguage } from '../i18n/loadLanguage';
import { detectLang, isLang, type Lang } from '../i18n/lang';

const KEY = 'adb.lang';

/** Saved choice, else the browser/OS language. main.tsx preloads it before the first render. */
export function readLang(): Lang {
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
  const latest = useRef(lang);
  const setLang = useCallback((next: Lang) => {
    latest.current = next;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    // Switch once the language has loaded, so the screen never flashes the fallback language.
    // A failed load still switches (UI falls back to Japanese, quizzes to English) rather than getting stuck.
    const apply = () => {
      if (latest.current === next) setLangState(next);
    };
    loadLanguage(next).then(apply, apply);
  }, []);
  return [lang, setLang] as const;
}


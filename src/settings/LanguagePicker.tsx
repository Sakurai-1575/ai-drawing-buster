import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { sound } from '../audio/SoundManager';
import { LANGS, LANG_NAMES, type Lang } from '../i18n/lang';

/**
 * Each name carries its own `lang` so it renders in that language's font (e.g. 简体中文 in a
 * Simplified Chinese face even while the UI is Japanese).
 */

/** Segmented row for the settings dialog. */
export function LanguagePicker({ lang, onLang }: { lang: Lang; onLang: (lang: Lang) => void }) {
  return (
    <div role="radiogroup" className="flex shrink-0 overflow-hidden rounded-xl border-[3px] border-slate-900 shadow-[3px_3px_0_#0f172a]" data-testid="lang-picker">
      {LANGS.map((l, i) => (
        <button
          key={l}
          type="button"
          role="radio"
          lang={l}
          aria-checked={lang === l}
          tabIndex={-1}
          data-lang={l}
          onClick={() => {
            sound.click();
            onLang(l);
          }}
          className={`whitespace-nowrap px-3 py-1.5 text-sm font-black ${i ? 'border-l-[3px] border-slate-900' : ''} ${
            lang === l ? 'bg-slate-900 text-amber-200' : 'bg-white hover:bg-amber-100'
          }`}
        >
          {LANG_NAMES[l]}
        </button>
      ))}
    </div>
  );
}

/** Compact "🌐 日本語 ▾" chip with a drop-down list, for the title screen. */
export function LanguageMenu({ lang, onLang, label }: { lang: Lang; onLang: (lang: Lang) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase so Esc closes the menu without also reaching the title screen's handlers.
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopImmediatePropagation();
      setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" data-testid="lang-menu">
      <button
        type="button"
        tabIndex={-1}
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          sound.unlock();
          sound.click();
          setOpen((o) => !o);
        }}
        className="comic-btn flex items-center gap-2 bg-white px-3 py-1.5 text-lg transition-transform hover:scale-110"
      >
        <span>🌐</span>
        <span lang={lang} className="whitespace-nowrap">
          {LANG_NAMES[lang]}
        </span>
        <span className="text-xs">▼</span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={label}
          className="animate-pop-in comic-card absolute right-0 top-[calc(100%+10px)] z-50 w-48 origin-top-right overflow-hidden bg-white py-1"
          style={{ '--rot': '0deg' } as CSSProperties}
        >
          {LANGS.map((l) => (
            <li key={l} role="option" aria-selected={lang === l}>
              <button
                type="button"
                tabIndex={-1}
                lang={l}
                data-lang={l}
                onClick={() => {
                  sound.click();
                  onLang(l);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2 text-left text-lg font-black ${
                  lang === l ? 'bg-slate-900 text-amber-200' : 'hover:bg-amber-100'
                }`}
              >
                {LANG_NAMES[l]}
                {lang === l && <span>✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

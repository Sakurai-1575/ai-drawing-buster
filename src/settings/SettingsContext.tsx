import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../data/quizzes';
import type { Dict } from '../i18n';
import { SettingsModal } from './SettingsModal';

interface SettingsApi {
  /** Open the settings modal from anywhere (every screen's ⚙️ button). */
  open: () => void;
  isOpen: boolean;
}

const SettingsContext = createContext<SettingsApi | null>(null);

/** Owns the single settings modal; render it inside the stage so it scales with the game. */
export function SettingsProvider({ t, lang, onLang, children }: { t: Dict; lang: Lang; onLang: (lang: Lang) => void; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const api = useMemo(() => ({ open, isOpen }), [open, isOpen]);
  return (
    <SettingsContext.Provider value={api}>
      {children}
      {isOpen && <SettingsModal t={t} lang={lang} onLang={onLang} onClose={close} />}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsApi {
  const api = useContext(SettingsContext);
  if (!api) throw new Error('useSettings must be used inside <SettingsProvider>');
  return api;
}

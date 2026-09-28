import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Lang } from '../data/quizzes';
import type { Dict } from '../i18n';
import { BusterDexModal } from './BusterDexModal';

interface DexApi {
  /** Open the Buster Dex from any screen. */
  open: () => void;
}

const DexContext = createContext<DexApi | null>(null);

export function DexProvider({ t, lang, scale, children }: { t: Dict; lang: Lang; scale: number; children: ReactNode }) {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);
  const api = useMemo(() => ({ open }), [open]);
  return (
    <DexContext.Provider value={api}>
      {children}
      {isOpen && <BusterDexModal t={t} lang={lang} scale={scale} onClose={close} />}
    </DexContext.Provider>
  );
}

export function useDex(): DexApi {
  const api = useContext(DexContext);
  if (!api) throw new Error('useDex must be used inside <DexProvider>');
  return api;
}


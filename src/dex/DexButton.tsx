import { useEffect, useState } from 'react';
import { sound } from '../audio/SoundManager';
import { DEX_TOTAL, loadDex, onDexChange } from '../game/dex';
import type { Dict } from '../i18n';
import { useDex } from './DexContext';

/** "📖 図鑑 12/76" — opens the Buster Dex. */
export function DexButton({ t, className = '' }: { t: Dict; className?: string }) {
  const { open } = useDex();
  const [found, setFound] = useState(() => loadDex().discovered.length);
  useEffect(() => onDexChange(() => setFound(loadDex().discovered.length)), []);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={t.dexTitle}
      onClick={() => {
        sound.unlock();
        sound.click();
        open();
      }}
      className={`comic-btn flex items-center justify-center gap-2 whitespace-nowrap bg-violet-300 ${className}`}
    >
      <span className="text-2xl leading-none">📖</span>
      <span>{t.dexButton}</span>
      <span className="rounded-md bg-slate-900 px-1.5 text-sm tabular-nums text-amber-200">
        {found}/{DEX_TOTAL}
      </span>
    </button>
  );
}

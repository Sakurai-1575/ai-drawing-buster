import type { Dict } from '../i18n';
import { SettingsButton } from '../settings/SettingsButton';

interface Props {
  t: Dict;
  onResume: () => void;
  onRestart: () => void;
  onTitle: () => void;
}

export function PauseMenu({ t, onResume, onRestart, onTitle }: Props) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-[2px]">
      <div className="comic-card animate-pop-in flex w-[440px] flex-col items-stretch gap-4 bg-amber-50 p-8" style={{ ['--rot' as string]: '0deg' }}>
        <h2 className="text-center text-5xl font-black tracking-wide text-slate-900">{t.paused}</h2>
        <button type="button" tabIndex={-1} onClick={onResume} className="comic-btn flex items-center justify-center gap-3 bg-emerald-300 py-3 text-2xl">
          ▶ {t.resume} <span className="key-badge">Esc</span>
        </button>
        <button type="button" tabIndex={-1} onClick={onRestart} className="comic-btn bg-sky-300 py-3 text-2xl">
          ↻ {t.restart}
        </button>
        <button type="button" tabIndex={-1} onClick={onTitle} className="comic-btn bg-white py-3 text-2xl">
          ⌂ {t.toTitle}
        </button>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <SettingsButton t={t} variant="menu" />
        </div>
      </div>
    </div>
  );
}

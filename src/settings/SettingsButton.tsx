import { sound } from '../audio/SoundManager';
import type { Dict } from '../i18n';
import { useSettings } from './SettingsContext';

interface Props {
  t: Dict;
  /** Runs before opening, e.g. pause solo play. */
  onBeforeOpen?: () => void;
  /** 'icon': compact square for crowded top bars. 'label': "⚙️ 設定". 'menu': full-width menu button. */
  variant?: 'icon' | 'label' | 'menu';
  className?: string;
}

/** The ⚙️ button every screen puts in its top-right corner. */
export function SettingsButton({ t, onBeforeOpen, variant = 'label', className = '' }: Props) {
  const { open } = useSettings();
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={t.settings}
      title={t.settings}
      onClick={() => {
        sound.unlock();
        sound.click();
        onBeforeOpen?.();
        open();
      }}
      className={`comic-btn group flex items-center justify-center gap-2 bg-white transition-transform hover:bg-amber-100 ${
        { icon: 'h-14 w-14 text-3xl hover:scale-110', label: 'px-4 py-1.5 text-lg hover:scale-110', menu: 'w-full py-3 text-2xl hover:scale-[1.03]' }[variant]
      } ${className}`}
    >
      <span className="inline-block transition-transform duration-300 group-hover:rotate-90">⚙️</span>
      {variant !== 'icon' && <span>{t.settings}</span>}
    </button>
  );
}

import { useEffect, useRef, useState } from 'react';
import { sound } from '../audio/SoundManager';
import type { Lang } from '../data/quizzes';
import type { Dict } from '../i18n';
import { onAchievementUnlocked, type Achievement } from '../services/achievements';

/** When several unlock at once, stagger them so each gets its own slide-in and chime. */
const STAGGER_MS = 700;

interface Toast {
  key: number;
  achievement: Achievement;
}

/** Mounted once (inside the stage): slides a card in from the top right for every new unlock. */
export function AchievementToaster({ t, lang }: { t: Dict; lang: Lang }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const nextSlot = useRef(0);

  useEffect(() => {
    const timers = new Set<number>();
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };
    const off = onAchievementUnlocked((achievement) => {
      const now = Date.now();
      const at = Math.max(now, nextSlot.current);
      nextSlot.current = at + STAGGER_MS;
      later(() => {
        sound.achievement();
        setToasts((list) => [...list, { key: ++seq.current, achievement }]);
      }, at - now);
    });
    return () => {
      off();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="pointer-events-none absolute right-5 top-20 z-[70] flex w-[360px] flex-col items-end gap-3" aria-live="polite">
      {toasts.map(({ key, achievement }) => (
        <div
          key={key}
          data-testid="achievement-toast"
          // Removed when its CSS animation ends (not on a timer): a background tab freezes the
          // animation, so an unlock that fires while hidden is still shown once the player returns.
          onAnimationEnd={() => setToasts((list) => list.filter((x) => x.key !== key))}
          className="animate-achievement-toast comic-card flex w-full items-center gap-3 bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 px-4 py-3"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-[3px] border-slate-900 bg-white text-3xl">
            {achievement.icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-black tracking-widest text-amber-800">{t.achUnlocked}</span>
            <span className="truncate text-xl font-black leading-tight">{achievement.title[lang]}</span>
          </div>
        </div>
      ))}
    </div>
  );
}


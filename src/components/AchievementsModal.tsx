import { useEffect, useMemo, useState } from 'react';
import type { Lang } from '../data/quizzes';
import { fmt, type Dict } from '../i18n';
import { ACHIEVEMENTS, loadAchievements, onAchievementsChange } from '../services/achievements';
import { Modal } from './TitleModals';

/** 🏆 Achievements list: progress bar + one card per achievement (locked = grey, secret = ???). */
export function AchievementsModal({ t, lang, onClose }: { t: Dict; lang: Lang; onClose: () => void }) {
  const [data, setData] = useState(loadAchievements);
  useEffect(() => onAchievementsChange(() => setData(loadAchievements())), []);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', day: 'numeric' }), [lang]);

  const total = ACHIEVEMENTS.length;
  const got = ACHIEVEMENTS.filter((a) => data.unlocked[a.id]).length;
  const pct = Math.round((got / total) * 100);

  return (
    <Modal title={<>🏆 {t.achTitle}</>} headerClass="bg-amber-300" closeLabel={t.close} onClose={onClose} widthClass="w-[1000px]">
      <div className="mb-4 flex items-center gap-4" data-testid="achievements-progress">
        <span className="whitespace-nowrap text-xl font-black">{fmt(t.achProgress, { got, total, pct })}</span>
        <div className="h-6 flex-1 overflow-hidden rounded-full border-[3px] border-slate-900 bg-slate-100">
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ul className="grid grid-cols-3 gap-x-2.5 gap-y-3.5">
        {ACHIEVEMENTS.map((a) => {
          const at = data.unlocked[a.id];
          const hidden = a.isSecret && !at;
          return (
            <li
              key={a.id}
              data-testid={`achievement-${a.id}`}
              data-unlocked={at ? 'true' : 'false'}
              className={`relative flex h-[74px] items-center gap-3 rounded-xl border-[3px] px-3 ${
                at ? 'border-slate-900 bg-amber-50 shadow-[3px_3px_0_#0f172a]' : 'border-slate-300 bg-slate-100 text-slate-400'
              }`}
            >
              <span
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-[3px] text-2xl ${
                  at ? 'border-slate-900 bg-white' : 'border-slate-300 bg-slate-200 grayscale opacity-50'
                }`}
              >
                {hidden ? '？' : a.icon}
              </span>
              <div className="flex min-w-0 flex-col">
                <span className={`truncate text-base font-black leading-tight ${at ? 'text-slate-900' : ''}`}>
                  {hidden ? '？？？' : a.title[lang]}
                  {a.isSecret && at && <span className="ml-1.5 text-xs text-violet-600">{t.achSecret}</span>}
                </span>
                <span className="line-clamp-2 text-xs font-bold leading-snug">{hidden ? t.achSecretHint : a.description[lang]}</span>
              </div>
              {at && (
                <span className="absolute -top-2.5 right-2 rounded-md border-2 border-slate-900 bg-amber-300 px-1.5 text-[10px] font-black leading-4">
                  ✓ {dateFmt.format(at)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}


import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import type { Lang } from '../data/quizzes';
import { TOP_SCORES_MAX, loadTopScores } from '../game/engine';
import type { Dict } from '../i18n';
import { RANK_STYLE } from './ResultScreen';

interface ModalProps {
  title: ReactNode;
  headerClass: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/** Comic-style dialog. Swallows keys while open so Space/Enter don't start a game behind it. */
function Modal({ title, headerClass, closeLabel, onClose, children }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Capture phase on window runs before App's handler; stop it from seeing the key.
      e.stopImmediatePropagation();
      if (['Escape', 'Space', 'Enter', 'NumpadEnter'].includes(e.code)) {
        e.preventDefault();
        if (!e.repeat) onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60" onPointerDown={onClose}>
      <div
        className="animate-pop-in comic-card w-[560px] overflow-hidden shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '-1deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className={`border-b-4 border-slate-900 px-6 py-3 text-3xl font-black ${headerClass}`}>{title}</div>
        <div className="px-6 py-5">{children}</div>
        <div className="flex justify-center pb-5">
          <button type="button" tabIndex={-1} onClick={onClose} className="comic-btn flex items-center gap-3 bg-white px-8 py-2 text-xl">
            {closeLabel} <span className="key-badge text-sm">Esc</span>
          </button>
        </div>
      </div>
    </div>
  );
}

const PLACE_STYLE = ['bg-amber-300', 'bg-slate-200', 'bg-orange-300', 'bg-white', 'bg-white'];

export function RankingModal({ t, lang, onClose }: { t: Dict; lang: Lang; onClose: () => void }) {
  const scores = useMemo(loadTopScores, []);
  const dateFmt = useMemo(() => new Intl.DateTimeFormat(lang, { month: 'short', day: 'numeric' }), [lang]);

  return (
    <Modal title={<>🏆 {t.leaderboard}</>} headerClass="bg-amber-300" closeLabel={t.close} onClose={onClose}>
      <div className="mb-2 text-sm font-black tracking-widest text-slate-500">{t.localRanking}</div>
      <ol className="space-y-2">
        {Array.from({ length: TOP_SCORES_MAX }, (_, i) => {
          const entry = scores[i];
          return (
            <li
              key={i}
              className={`flex h-12 items-center gap-4 rounded-xl border-[3px] border-slate-900 px-3 font-black ${
                entry ? PLACE_STYLE[i] : 'bg-slate-50 text-slate-300'
              }`}
            >
              <span className="w-10 text-center text-2xl">{i < 3 && entry ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              {entry ? (
                <>
                  <span className="flex-1 text-3xl tabular-nums">{entry.score.toLocaleString()}</span>
                  <span className="text-sm text-slate-500">{dateFmt.format(entry.at)}</span>
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-slate-900 text-xl ${RANK_STYLE[entry.rank]}`}
                  >
                    {entry.rank}
                  </span>
                </>
              ) : (
                <span className="flex-1 text-2xl">—</span>
              )}
            </li>
          );
        })}
      </ol>
      {!scores.length && <p className="mt-3 text-center text-lg font-black text-slate-500">{t.noScores}</p>}

      <div className="mt-4 flex items-center justify-between rounded-xl border-[3px] border-dashed border-slate-400 bg-slate-100 px-4 py-2.5">
        <span className="text-lg font-black text-slate-500">🌐 {t.globalRanking}</span>
        <span className="rounded-lg bg-slate-900 px-3 py-0.5 text-sm font-black text-amber-200">{t.comingSoon}</span>
      </div>
    </Modal>
  );
}

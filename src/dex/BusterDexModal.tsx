import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { sound } from '../audio/SoundManager';
import { DrawingCanvas } from '../components/DrawingCanvas';
import { MascotCharacter } from '../components/MascotCharacter';
import { GENRES, GENRE_LABELS, GENRE_SHORT, type Genre } from '../data/genres';
import { QUIZZES, quizComment, quizLabel, quizLang, type Lang, type Quiz } from '../data/quizzes';
import { DEX_TOTAL, loadDex, onDexChange, type DexProgress } from '../game/dex';
import { fmt, type Dict } from '../i18n';

interface Props {
  t: Dict;
  lang: Lang;
  scale: number;
  onClose: () => void;
}

const THUMB = 104;

function useDexProgress(): DexProgress {
  const [p, setP] = useState(loadDex);
  useEffect(() => onDexChange(() => setP(loadDex())), []);
  return p;
}

const fmtTime = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(2)}s`);

/** Buster Dex: every AI quiz, unlocked by answering it correctly in any mode. */
export function BusterDexModal({ t, lang, scale, onClose }: Props) {
  const progress = useDexProgress();
  const [tab, setTab] = useState<Genre | 'all'>('all');
  const [selected, setSelected] = useState<Quiz | null>(null);
  const found = progress.discovered.length;
  const pct = Math.round((found / DEX_TOTAL) * 100);
  const shown = useMemo(() => (tab === 'all' ? QUIZZES : QUIZZES.filter((q) => q.genre === tab)), [tab]);
  const countIn = (g: Genre | 'all') => {
    const list = g === 'all' ? QUIZZES : QUIZZES.filter((q) => q.genre === g);
    return `${list.filter((q) => progress.stats[q.id]).length}/${list.length}`;
  };

  // Esc: detail → grid → close. Keys never reach the game underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') return;
      e.preventDefault();
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selected, onClose]);

  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center bg-slate-900/60" onPointerDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.dexTitle}
        data-testid="dex"
        className="animate-pop-in comic-card relative flex h-[680px] w-[1200px] flex-col overflow-hidden bg-amber-50 shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '0deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Header: title, progress, close */}
        <div className="flex items-center gap-5 border-b-4 border-slate-900 bg-amber-300 px-6 py-3">
          <h2 className="whitespace-nowrap text-3xl font-black">📖 {t.dexTitle}</h2>
          <div className="flex flex-1 items-center gap-3">
            <span className="whitespace-nowrap text-lg font-black" data-testid="dex-progress">
              {t.dexProgress}: {found}/{DEX_TOTAL} ({pct}%)
            </span>
            <div className="h-5 flex-1 overflow-hidden rounded-full border-[3px] border-slate-900 bg-white">
              <div className="h-full rounded-full bg-gradient-to-r from-rose-400 to-amber-400 transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t.close}
            onClick={onClose}
            className="comic-btn flex h-11 w-11 items-center justify-center bg-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Genre tabs: a fixed 6-column grid (2 rows for 11 tabs) so every tab stays visible in every language. */}
        <div role="tablist" className="grid grid-cols-6 gap-1.5 border-b-[3px] border-slate-200 bg-white px-4 py-2">
          {(['all', ...GENRES] as const).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={tab === g}
              tabIndex={-1}
              onClick={() => {
                sound.click();
                setTab(g);
              }}
              title={g === 'all' ? t.dexAll : GENRE_LABELS[g][lang]}
              className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border-[3px] border-slate-900 px-2 py-1 text-sm font-black leading-tight ${
                tab === g ? 'bg-slate-900 text-amber-200' : 'bg-white hover:bg-amber-100'
              }`}
            >
              <span className="min-w-0 truncate">{g === 'all' ? `📚 ${t.dexAll}` : GENRE_SHORT[g][lang]}</span>
              <span className="shrink-0 text-xs tabular-nums opacity-75">{countIn(g)}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-8 gap-3">
            {shown.map((q) => {
              const stat = progress.stats[q.id];
              return (
                <button
                  key={q.id}
                  type="button"
                  tabIndex={-1}
                  data-dex={q.id}
                  data-unlocked={stat ? 'true' : 'false'}
                  onClick={() => {
                    sound.click();
                    setSelected(q);
                  }}
                  className={`comic-btn relative flex flex-col items-center gap-1 px-1.5 pb-1.5 pt-2 ${stat ? 'bg-white' : 'bg-slate-700'}`}
                >
                  {stat ? (
                    <>
                      <div className="paper-bg overflow-hidden rounded-lg border-2 border-slate-300">
                        <DrawingCanvas strokes={q.strokes} progress={1} size={THUMB} scale={scale} showPencil={false} />
                      </div>
                      <span className="w-full truncate text-sm font-black">{quizLabel(q, lang)}</span>
                      {stat.bestTimeMs !== null && (
                        <span className="absolute -right-2 -top-2 rounded-md border-2 border-slate-900 bg-amber-300 px-1 text-[11px] font-black tabular-nums">
                          ⚡{fmtTime(stat.bestTimeMs)}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-center rounded-lg border-2 border-slate-500 bg-slate-800 text-6xl font-black text-slate-500" style={{ width: THUMB + 4, height: THUMB + 4 }}>
                        ？
                      </div>
                      <span className="text-sm font-black text-slate-300">？？？</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {selected && <DexDetail t={t} lang={lang} scale={scale} quiz={selected} progress={progress} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

function DexDetail({ t, lang, scale, quiz, progress, onClose }: { t: Dict; lang: Lang; scale: number; quiz: Quiz; progress: DexProgress; onClose: () => void }) {
  const stat = progress.stats[quiz.id];
  // Subtitle: the name in the game's original Japanese (English for Japanese players), unless that's what's already shown.
  const other: Lang = lang === 'ja' ? 'en' : 'ja';
  const showOther = quizLang(quiz, lang) !== other;
  const date = stat ? new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(stat.firstCorrectAt) : '';
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/50" onPointerDown={onClose} data-testid="dex-detail">
      <div
        className="animate-pop-in comic-card relative flex w-[900px] gap-6 bg-white p-6 shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '-1deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={t.close}
          onClick={onClose}
          className="comic-btn absolute -right-4 -top-4 flex h-11 w-11 items-center justify-center bg-white text-2xl leading-none"
        >
          ×
        </button>

        <div className={`shrink-0 overflow-hidden rounded-2xl border-4 border-slate-900 ${stat ? 'paper-bg' : 'bg-slate-800'}`}>
          {stat ? (
            <DrawingCanvas strokes={quiz.strokes} progress={1} size={320} scale={scale} showPencil={false} />
          ) : (
            <div className="flex h-[320px] w-[320px] items-center justify-center text-[160px] font-black text-slate-600">？</div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <span className="w-fit rounded-lg border-[3px] border-slate-900 bg-sky-200 px-2 py-0.5 text-sm font-black">{GENRE_LABELS[quiz.genre][lang]}</span>
          {stat ? (
            <>
              <div>
                <div className="text-5xl font-black leading-tight" data-testid="dex-name">
                  {quizLabel(quiz, lang)}
                </div>
                {showOther && (
                  <div lang={other} className="text-lg font-bold text-slate-500">
                    {quizLabel(quiz, other)}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Stat label={t.dexBest} value={fmtTime(stat.bestTimeMs)} tone="bg-amber-200" />
                <Stat label={t.dexCount} value={fmt(t.dexTimes, { n: stat.correctCount })} tone="bg-emerald-200" />
                <Stat label={t.dexFirst} value={date} tone="bg-sky-200" small />
              </div>
              {stat.bestTimeMs === null && <div className="text-xs font-bold text-slate-500">⚡ {t.dexNoBestHint}</div>}
              <div className="mt-auto flex items-end gap-3">
                <MascotCharacter expression={quiz.dexMood} size={110} />
                <div className="relative mb-6 flex-1 rounded-2xl border-4 border-slate-900 bg-sky-100 px-4 py-3 text-base font-bold leading-relaxed shadow-[4px_4px_0_#0f172a] [text-wrap:pretty]" data-testid="dex-comment">
                  {quizComment(quiz, lang)}
                  <span className="absolute -left-[15px] bottom-5 h-6 w-6 rotate-45 border-b-4 border-l-4 border-slate-900 bg-sky-100" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="text-5xl font-black text-slate-400">？？？</div>
              <div className="mt-auto flex items-end gap-3">
                <MascotCharacter expression="smug" size={110} />
                <div className="relative mb-6 flex-1 rounded-2xl border-4 border-slate-900 bg-sky-100 px-4 py-3 text-lg font-black shadow-[4px_4px_0_#0f172a]">
                  {t.dexLockedHint}
                  <span className="absolute -left-[15px] bottom-5 h-6 w-6 rotate-45 border-b-4 border-l-4 border-slate-900 bg-sky-100" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone, small = false }: { label: string; value: string; tone: string; small?: boolean }) {
  return (
    <div className={`min-w-0 rounded-xl border-[3px] border-slate-900 px-3 py-1.5 ${tone}`}>
      <div className="truncate text-xs font-black text-slate-600">{label}</div>
      <div className={`truncate font-black tabular-nums ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
    </div>
  );
}


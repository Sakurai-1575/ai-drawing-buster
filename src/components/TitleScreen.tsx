import { useEffect, useState } from 'react';
import { sound } from '../audio/SoundManager';
import { QUIZZES, type Lang } from '../data/quizzes';
import type { Dict } from '../i18n';
import { DrawingCanvas } from './DrawingCanvas';
import { MascotCharacter } from './MascotCharacter';
import { RankingModal } from './TitleModals';
import { SettingsButton } from '../settings/SettingsButton';
import { DexButton } from '../dex/DexButton';

const DEMO_CYCLE_MS = 4200;
const DEMO_DRAW_MS = 3000;

interface Props {
  t: Dict;
  lang: Lang;
  scale: number;
  bestScore: number;
  onStart: () => void;
  onOpenMultiplayer: () => void;
}

const HOW_TO_ICONS = ['⏱️', '⚡', '🏆', '⚠️'];
const HOW_TO_TAG_BG = ['bg-sky-300', 'bg-amber-300', 'bg-emerald-300', 'bg-rose-300'];

export function TitleScreen({ t, lang, scale, bestScore, onStart, onOpenMultiplayer }: Props) {
  const [rankingOpen, setRankingOpen] = useState(false);
  const openRanking = () => {
    sound.unlock();
    sound.click();
    setRankingOpen(true);
  };
  const close = () => {
    sound.click();
    setRankingOpen(false);
  };

  return (
    <div className="relative flex h-full w-full items-center justify-center gap-14 p-10">
      <div className="absolute right-6 top-6 flex items-center gap-4">
        <SettingsButton t={t} />
      </div>

      <div className="flex w-[580px] flex-col gap-5">
        <div className="-rotate-[4deg]">
          <div className="inline-block rotate-[2deg] rounded-xl border-4 border-slate-900 bg-sky-300 px-3 py-0.5 text-lg font-black shadow-[4px_4px_0px_#0f172a]">
            REAL-TIME SKETCH QUIZ
          </div>
          <h1 className="logo-3d mt-2 whitespace-nowrap text-[60px] font-black leading-[1.1] tracking-tight">{t.title}</h1>
        </div>
        <p className="text-2xl font-black text-slate-700">{t.tagline}</p>

        <ul className="comic-card space-y-1.5 bg-white px-5 py-3 text-lg font-bold text-slate-800">
          {[t.howTo1, t.howTo2, t.howTo3, t.howTo4].map((line, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-8 shrink-0 text-center text-2xl leading-none">{HOW_TO_ICONS[i]}</span>
              <span
                className={`w-[92px] shrink-0 rounded-md border-[3px] border-slate-900 py-0.5 text-center text-sm font-black ${HOW_TO_TAG_BG[i]}`}
              >
                {[t.howToTag1, t.howToTag2, t.howToTag3, t.howToTag4][i]}
              </span>
              <span className="leading-snug">{line}</span>
            </li>
          ))}
        </ul>

        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            tabIndex={-1}
            onClick={onStart}
            className="comic-btn animate-breathe flex w-[440px] flex-col items-center bg-rose-500 pb-2 pt-3 text-white"
          >
            <span className="text-5xl leading-none tracking-wider [-webkit-text-stroke:2px_#0f172a] [paint-order:stroke_fill]">▶ {t.start}</span>
            <span className="mt-1.5 text-sm font-black tracking-widest text-white/85">{t.startKeys}</span>
          </button>
          <div className="flex w-[560px] gap-3">
            <SubButton
              icon="👥"
              label={t.multiplayer}
              className="bg-sky-300"
              onClick={() => {
                sound.unlock();
                sound.click();
                onOpenMultiplayer();
              }}
            />
            <SubButton icon="🏆" label={t.leaderboard} className="bg-amber-300" onClick={openRanking} />
            <DexButton t={t} className="flex-1 py-2.5 text-lg" />
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5">
        <BestScore t={t} score={bestScore} />
        <TitleDemo scale={scale} lang={lang} />
      </div>

      {rankingOpen && <RankingModal t={t} lang={lang} onClose={close} />}
    </div>
  );
}

function SubButton({ icon, label, className, onClick }: { icon: string; label: string; className: string; onClick: () => void }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      className={`comic-btn flex flex-1 items-center justify-center gap-2 whitespace-nowrap py-2.5 text-lg ${className}`}
    >
      <span className="text-2xl leading-none">{icon}</span>
      {label}
    </button>
  );
}

function BestScore({ t, score }: { t: Dict; score: number }) {
  return (
    <div
      className="comic-card flex items-center gap-4 bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-300 px-6 py-2"
      style={{ transform: 'rotate(-2deg)' }}
    >
      <span className="text-5xl leading-none drop-shadow-[2px_2px_0_#0f172a]">🏆</span>
      <div className="flex flex-col">
        <span className="text-sm font-black tracking-[0.2em] text-amber-900">{t.bestScore}</span>
        <span className="text-4xl font-black tabular-nums leading-none text-slate-900">{score.toLocaleString()}</span>
      </div>
    </div>
  );
}
/** Loops through the quiz drawings as an attract-mode preview. */
function TitleDemo({ scale, lang }: { scale: number; lang: Lang }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      // rAF timestamps are frame-start times and can precede t0; a negative time would index past the array.
      setTime(Math.max(0, now - t0));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cycle = Math.floor(time / DEMO_CYCLE_MS);
  const quiz = QUIZZES[cycle % QUIZZES.length];
  const progress = Math.min(1, (time % DEMO_CYCLE_MS) / DEMO_DRAW_MS);
  // Buster-kun smirks mid-drawing on every other picture, and is his cheerful self otherwise.
  const smirking = cycle % 2 === 1 && progress > 0.25 && progress < 0.95;

  return (
    <div className="relative flex flex-col items-center gap-4" style={{ transform: 'rotate(2deg)' }}>
      <div className="comic-card paper-bg overflow-hidden rounded-3xl">
        <DrawingCanvas strokes={quiz.strokes} progress={progress} size={370} scale={scale} showPencil={progress < 1} />
      </div>
      <MascotCharacter expression={smirking ? 'smug' : 'normal'} size={140} className="absolute -right-[104px] bottom-[34px]" />
      <div className="comic-card min-w-[200px] bg-amber-200 px-5 py-2 text-center text-2xl font-black">
        {progress < 1 ? '？？？' : quiz.labels[lang]}
      </div>
    </div>
  );
}

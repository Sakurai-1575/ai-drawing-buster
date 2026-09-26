import { useEffect, useState } from 'react';
import { sound } from '../audio/SoundManager';
import { MascotCharacter } from '../components/MascotCharacter';
import { fmt, type Dict } from '../i18n';
import { MAX_PLAYERS, type GameMode } from '../net/protocol';
import { SettingsButton } from '../settings/SettingsButton';

interface Props {
  t: Dict;
  onPick: (mode: GameMode) => void;
  onBack: () => void;
}

/** Online entry: pick Mode A (AI speed-guess) or Mode B (draw together). Buster-kun hosts. */
export function ModeSelect({ t, onPick, onBack }: Props) {
  // Buster-kun smirks at whichever card you hover.
  const [hover, setHover] = useState<GameMode | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onBack();
      if (e.code === 'Digit1' || e.code === 'KeyA') pick('A');
      if (e.code === 'Digit2' || e.code === 'KeyB') pick('B');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const pick = (mode: GameMode) => {
    sound.unlock();
    sound.click();
    onPick(mode);
  };

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-6 p-10">
      <div className="absolute right-6 top-6 flex items-center gap-3">
        <SettingsButton t={t} />
      </div>
      <button type="button" tabIndex={-1} onClick={onBack} className="comic-btn absolute left-6 top-6 bg-white px-4 py-1.5 text-lg">
        ← {t.toTitle}
      </button>

      <h1 className="logo-3d -rotate-2 text-[56px] font-black leading-tight">👥 {t.mpTitle}</h1>

      <div className="flex items-end gap-8">
        <div className="flex flex-col items-center">
          <div className="animate-balloon-pop relative mb-4 rounded-2xl border-4 border-slate-900 bg-sky-200 px-5 py-2 text-2xl font-black shadow-[4px_4px_0_#0f172a]">
            {t.mpChooseMode}
            <span className="absolute -bottom-[14px] left-1/2 h-6 w-6 -translate-x-1/2 rotate-45 border-b-4 border-r-4 border-slate-900 bg-sky-200" />
          </div>
          <MascotCharacter expression={hover ? 'smug' : 'normal'} size={200} />
        </div>

        <div className="flex gap-6">
          <ModeCard
            badge="A"
            icon="⚡"
            title={t.mpModeACard}
            desc={t.mpModeACardDesc}
            players={fmt(t.mpPlayersRange, { max: MAX_PLAYERS })}
            color="bg-sky-300"
            rot="-2deg"
            onPick={() => pick('A')}
            onHover={(on) => setHover(on ? 'A' : null)}
          />
          <ModeCard
            badge="B"
            icon="🎨"
            title={t.mpModeBCard}
            desc={t.mpModeBCardDesc}
            players={fmt(t.mpPlayersRange, { max: MAX_PLAYERS })}
            color="bg-emerald-300"
            rot="2deg"
            onPick={() => pick('B')}
            onHover={(on) => setHover(on ? 'B' : null)}
          />
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  badge: string;
  icon: string;
  title: string;
  desc: string;
  players: string;
  color: string;
  rot: string;
  onPick: () => void;
  onHover: (on: boolean) => void;
}

function ModeCard({ badge, icon, title, desc, players, color, rot, onPick, onHover }: CardProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onPick}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={`comic-btn group relative flex h-[330px] w-[300px] flex-col items-center gap-3 px-5 pt-6 text-center ${color}`}
      style={{ transform: `rotate(${rot})` }}
    >
      <span className="absolute -left-4 -top-4 flex h-12 w-12 items-center justify-center rounded-full border-4 border-slate-900 bg-white text-2xl font-black shadow-[3px_3px_0_#0f172a]">
        {badge}
      </span>
      <span className="text-7xl transition-transform group-hover:scale-110">{icon}</span>
      <span className="text-3xl font-black leading-tight">{title}</span>
      <span className="text-lg font-bold leading-snug text-slate-800">{desc}</span>
      <span className="mt-auto mb-5 rounded-lg bg-slate-900 px-3 py-0.5 text-sm font-black text-amber-200">{players}</span>
    </button>
  );
}

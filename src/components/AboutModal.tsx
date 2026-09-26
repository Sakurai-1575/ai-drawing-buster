import { useState } from 'react';
import { sound } from '../audio/SoundManager';
import type { Dict } from '../i18n';
import { MASCOT_EXPRESSIONS, type MascotExpression } from '../mascotLines';
import { checkAchievements } from '../services/achievements';
import { MascotCharacter } from './MascotCharacter';
import { Modal } from './TitleModals';

/** A random face other than the current one, so every tap visibly changes something. */
function nextExpression(current: MascotExpression): MascotExpression {
  const others = MASCOT_EXPRESSIONS.filter((e) => e !== current);
  return others[Math.floor(Math.random() * others.length)];
}

/** Title screen → click Buster-kun: a profile card with a tappable portrait and rotating one-liners. */
export function AboutModal({ t, onClose }: { t: Dict; onClose: () => void }) {
  const [expression, setExpression] = useState<MascotExpression>('wink');
  const [lineIndex, setLineIndex] = useState(0);
  const lines = [t.aboutLine1, t.aboutLine2, t.aboutLine3, t.aboutLine4];

  const profile: [label: string, value: string][] = [
    [t.aboutNameLabel, t.aboutName],
    [t.aboutSpeciesLabel, t.aboutSpecies],
    [t.aboutLikesLabel, t.aboutLikes],
    [t.aboutDislikesLabel, t.aboutDislikes],
    [t.aboutCatchphraseLabel, t.aboutCatchphrase],
  ];

  return (
    <Modal title={t.aboutTitle} headerClass="bg-teal-300" closeLabel={t.close} onClose={onClose} widthClass="w-[760px]">
      <div className="flex gap-6">
        <button
          type="button"
          tabIndex={-1}
          aria-label={t.aboutPortraitHint}
          data-testid="about-portrait"
          data-expression={expression}
          onClick={() => {
            sound.click();
            checkAchievements({ type: 'busterClick' });
            setExpression(nextExpression);
          }}
          className="paper-bg flex w-[210px] shrink-0 cursor-pointer flex-col items-center justify-end gap-2 rounded-2xl border-4 border-slate-900 px-3 pb-2 pt-6"
        >
          {/* key remounts the svg so one-shot motions (shock) replay on every change */}
          <MascotCharacter key={expression} expression={expression} size={170} />
          <span className="text-xs font-black text-slate-500">👆 {t.aboutPortraitHint}</span>
        </button>

        <dl className="grid flex-1 grid-cols-[auto_1fr] content-center gap-x-4 gap-y-2.5 text-lg">
          {profile.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="self-start whitespace-nowrap rounded-md border-[3px] border-slate-900 bg-amber-200 px-2 py-0.5 text-center text-sm font-black">
                {label}
              </dt>
              <dd className="self-center font-bold leading-snug text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 text-sm font-black tracking-widest text-slate-500">💬 {t.aboutSaysLabel}</div>
      <button
        type="button"
        tabIndex={-1}
        data-testid="about-line"
        onClick={() => {
          sound.click();
          setLineIndex((i) => (i + 1) % lines.length);
        }}
        className="mt-1.5 flex w-full cursor-pointer items-center gap-3 rounded-2xl border-4 border-slate-900 bg-white px-4 py-3 text-left transition-transform hover:-translate-y-0.5"
      >
        <span key={lineIndex} className="animate-balloon-pop flex-1 text-xl font-black leading-snug">
          {lines[lineIndex]}
        </span>
        <span className="shrink-0 text-xs font-black text-slate-400">
          {lineIndex + 1}/{lines.length} ▶
        </span>
      </button>
      <div className="mt-1 text-right text-xs font-bold text-slate-400">{t.aboutLineHint}</div>
    </Modal>
  );
}

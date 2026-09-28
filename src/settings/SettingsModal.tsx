import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { BGM_SOURCE, BGM_TRACKS, bgm, type BgmTrack } from '../audio/BgmManager';
import { sound } from '../audio/SoundManager';
import type { Lang } from '../data/quizzes';
import type { Dict } from '../i18n';
import { LanguagePicker } from './LanguagePicker';

/**
 * Settings are declared as data: a list of sections, each a list of rows (label + control).
 * To add a setting (resolution, key config, drawing options…), add a row to `buildSections`.
 */
export interface SettingRow {
  id: string;
  label: string;
  hint?: string;
  control: ReactNode;
}

export interface SettingSection {
  id: string;
  icon: string;
  title: string;
  rows: SettingRow[];
}

interface Props {
  t: Dict;
  lang: Lang;
  onLang: (lang: Lang) => void;
  onClose: () => void;
}

/** Live mirror of the audio settings (they can also change via the M key). */
function useAudioSettings() {
  const read = () => ({ muted: sound.muted, bgm: bgm.volume, se: sound.seVolume });
  const [state, setState] = useState(read);
  useEffect(() => {
    const refresh = () => setState(read());
    const offSound = sound.onMuteChange(refresh);
    const offBgm = bgm.onVolumeChange(refresh);
    return () => {
      offSound();
      offBgm();
    };
  }, []);
  return state;
}

function buildSections(t: Dict, lang: Lang, onLang: (l: Lang) => void, audio: ReturnType<typeof useAudioSettings>): SettingSection[] {
  return [
    {
      id: 'language',
      icon: '🌐',
      title: t.setLanguage,
      rows: [
        {
          id: 'lang',
          label: t.setLanguageLabel,
          control: <LanguagePicker lang={lang} onLang={onLang} />,
        },
      ],
    },
    {
      id: 'audio',
      icon: '🔊',
      title: t.setAudio,
      rows: [
        {
          id: 'sound',
          label: t.setSound,
          hint: t.setSoundHint,
          control: (
            <Switch
              on={!audio.muted}
              label={t.setSound}
              onText={t.on}
              offText={t.off}
              onChange={(on) => {
                sound.unlock();
                bgm.unlock();
                sound.muted = !on;
                if (on) sound.click();
              }}
            />
          ),
        },
        {
          id: 'bgm',
          label: t.bgmVolume,
          control: <Slider label={t.bgmVolume} value={audio.bgm} dimmed={audio.muted} onChange={(v) => (bgm.volume = v)} />,
        },
        {
          id: 'se',
          label: t.seVolume,
          control: (
            <Slider
              label={t.seVolume}
              value={audio.se}
              dimmed={audio.muted}
              onChange={(v) => (sound.seVolume = v)}
              // Play a sample on release so the level can be judged.
              onCommit={() => {
                sound.unlock();
                sound.click();
              }}
            />
          ),
        },
      ],
    },
  ];
}

export function SettingsModal({ t, lang, onLang, onClose }: Props) {
  const [view, setView] = useState<'settings' | 'credits'>('settings');
  const audio = useAudioSettings();
  const sections = buildSections(t, lang, onLang, audio);

  // Esc closes (credits → back first). Every key is kept away from the game underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.code === 'Escape') {
        e.preventDefault();
        if (view === 'credits') setView('settings');
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [view, onClose]);

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/60" onPointerDown={onClose} data-testid="settings-backdrop">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.settings}
        className="animate-pop-in comic-card relative w-[640px] overflow-hidden bg-amber-50 shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '0deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b-4 border-slate-900 bg-amber-300 px-6 py-3">
          {view === 'credits' && (
            <button type="button" tabIndex={-1} onClick={() => setView('settings')} className="comic-btn bg-white px-3 py-0.5 text-base">
              ← {t.settings}
            </button>
          )}
          <h2 className="text-3xl font-black">{view === 'settings' ? `⚙️ ${t.settings}` : `🎵 ${t.credits}`}</h2>
          <button
            type="button"
            tabIndex={-1}
            aria-label={t.close}
            onClick={onClose}
            className="comic-btn ml-auto flex h-11 w-11 items-center justify-center bg-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {view === 'settings' ? (
          <div className="flex flex-col gap-4 px-6 py-5">
            {sections.map((section) => (
              <section key={section.id} data-section={section.id}>
                <h3 className="mb-2 text-sm font-black tracking-widest text-slate-500">
                  {section.icon} {section.title}
                </h3>
                <div className="overflow-hidden rounded-2xl border-4 border-slate-900 bg-white">
                  {section.rows.map((row, i) => (
                    <div key={row.id} data-setting={row.id} className={`flex min-h-[60px] items-center gap-4 px-4 py-2 ${i ? 'border-t-2 border-slate-200' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <div className="text-lg font-black leading-tight">{row.label}</div>
                        {row.hint && <div className="text-xs font-bold text-slate-500">{row.hint}</div>}
                      </div>
                      {row.control}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <button
              type="button"
              tabIndex={-1}
              onClick={() => setView('credits')}
              className="comic-btn flex items-center justify-between bg-white px-4 py-2.5 text-lg"
            >
              <span>🎵 {t.credits}</span>
              <span className="text-sm text-slate-500">{t.creditsHint} →</span>
            </button>
          </div>
        ) : (
          <Credits t={t} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- credits

function Credits({ t }: { t: Dict }) {
  const group = (title: string, tracks: BgmTrack[]) => (
    <div>
      <div className="mb-1 text-xs font-black tracking-widest text-slate-500">{title}</div>
      <ul className="divide-y-2 divide-slate-100 rounded-xl border-[3px] border-slate-900 bg-white">
        {tracks.map((tr) => (
          <li key={tr.file} className="flex items-center justify-between gap-3 px-3 py-1.5">
            {/* Track titles are Japanese proper names; keep them in a Japanese face whatever the UI language. */}
            <span lang="ja" className="truncate font-black">
              ♪ {tr.title}
            </span>
            <span className={`shrink-0 text-sm font-bold ${tr.artist ? 'text-slate-700' : 'text-rose-500'}`}>{tr.artist ?? t.creditsArtistTbd}</span>
          </li>
        ))}
      </ul>
    </div>
  );
  return (
    <div className="flex max-h-[520px] flex-col gap-3 overflow-y-auto px-6 py-5" data-testid="credits">
      <div className="flex items-center justify-between rounded-xl bg-slate-900 px-4 py-2 text-amber-200">
        <span className="font-black">BGM: {BGM_SOURCE.name}</span>
        <a href={BGM_SOURCE.url} target="_blank" rel="noreferrer" className="text-sm font-bold underline">
          {BGM_SOURCE.url}
        </a>
      </div>
      {group(t.creditsTitleBgm, BGM_TRACKS.title)}
      {group(t.creditsGameBgm, BGM_TRACKS.game)}
      <div className="rounded-xl border-[3px] border-dashed border-slate-300 px-3 py-2 text-sm font-bold text-slate-600">
        <div>🔔 {t.creditsSe}</div>
        <div>✏️ {t.creditsArt}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- controls

function Switch({ on, label, onText, offText, onChange }: { on: boolean; label: string; onText: string; offText: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      tabIndex={-1}
      onClick={() => onChange(!on)}
      className={`relative flex h-10 w-[112px] shrink-0 items-center rounded-full border-[3px] border-slate-900 px-1 shadow-[3px_3px_0_#0f172a] transition-colors ${
        on ? 'bg-emerald-300' : 'bg-slate-300'
      }`}
    >
      <span className={`absolute text-sm font-black ${on ? 'left-3' : 'right-3'}`}>{on ? onText : offText}</span>
      <span className={`h-7 w-7 rounded-full border-[3px] border-slate-900 bg-white transition-transform ${on ? 'translate-x-[68px]' : 'translate-x-0'}`} />
    </button>
  );
}

function Slider({
  label,
  value,
  dimmed,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  dimmed: boolean;
  onChange: (v: number) => void;
  onCommit?: () => void;
}) {
  const pct = Math.round(value * 100);
  return (
    <div className={`flex shrink-0 items-center gap-3 ${dimmed ? 'opacity-50' : ''}`}>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={pct}
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        onPointerUp={onCommit}
        className="h-2 w-52 cursor-pointer accent-rose-500"
      />
      <span className="w-12 text-right text-lg font-black tabular-nums">{pct}%</span>
    </div>
  );
}


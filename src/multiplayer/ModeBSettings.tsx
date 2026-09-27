import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { Lang } from '../data/quizzes';
import { GENRES, GENRE_LABELS } from '../data/genres';
import { fmt, type Dict } from '../i18n';
import { FIXED_COUNT_OPTIONS, LAP_OPTIONS, TOPIC_TEXT_MAX, isValidTopic, type CustomTopic, type Genre, type TopicRule } from '../net/protocol';
import { loadSavedTopics, makeTopic, saveTopics } from './customTopics';
import type { MatchApi, MatchView } from './useMatch';

interface Props {
  t: Dict;
  lang: Lang;
  view: MatchView;
  match: MatchApi;
}

/** Mode B lobby rules: who draws, how many rounds, and where topics come from. Host edits; guests see them live. */
export function ModeBSettings({ t, lang, view, match }: Props) {
  const [modalOpen, setModalOpen] = useState(false);
  const isHost = view.role === 'host';
  const s = view.settings;
  const connected = view.players.filter((p) => p.connected);
  const totalRounds = s.drawerRule === 'rotate' ? connected.length * s.laps : s.fixedCount;
  const artistId = s.fixedDrawerId ?? view.players.find((p) => p.isHost)?.id;

  const toggleGenre = (g: Genre) => match.updateSettings({ genres: s.genres.includes(g) ? s.genres.filter((x) => x !== g) : [...s.genres, g] });

  return (
    <div className="comic-card flex w-[960px] flex-col gap-3 bg-white px-5 py-3">
      <Row label={t.mpDrawerRule}>
        <Segmented
          disabled={!isHost}
          value={s.drawerRule}
          options={[
            ['rotate', `🔁 ${t.mpRotate}`],
            ['fixed', `👤 ${t.mpFixed}`],
          ]}
          onChange={(v) => match.updateSettings({ drawerRule: v })}
        />
        {s.drawerRule === 'rotate' ? (
          <Choices label={t.mpLaps} disabled={!isHost} value={s.laps} options={LAP_OPTIONS} format={(n) => fmt(t.mpLapN, { n })} onChange={(n) => match.updateSettings({ laps: n })} />
        ) : (
          <Choices label={t.mpRounds} disabled={!isHost} value={s.fixedCount} options={FIXED_COUNT_OPTIONS} onChange={(n) => match.updateSettings({ fixedCount: n })} />
        )}
        <span className="ml-auto whitespace-nowrap rounded-lg bg-slate-900 px-3 py-1 text-base font-black text-amber-200">{fmt(t.mpTotalRounds, { n: totalRounds })}</span>
      </Row>

      {s.drawerRule === 'fixed' && (
        <Row label={t.mpArtist}>
          <div className="flex flex-wrap gap-2">
            {connected.map((p) => (
              <Pill key={p.id} active={p.id === artistId} disabled={!isHost} onClick={() => match.updateSettings({ fixedDrawerId: p.id })}>
                ✏️ {p.name}
              </Pill>
            ))}
          </div>
        </Row>
      )}

      <Row label={t.mpTopicRule}>
        <Segmented
          disabled={!isHost}
          value={s.topicRule}
          options={[
            ['all', `🎲 ${t.mpTopicAll}`],
            ['genre', `🏷️ ${t.mpTopicGenre}`],
            ['custom', `✍️ ${t.mpTopicCustom}`],
          ] as [TopicRule, string][]}
          onChange={(v) => match.updateSettings({ topicRule: v })}
        />
        {s.topicRule === 'genre' && (
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {GENRES.map((g) => (
              <Pill key={g} small active={s.genres.includes(g)} disabled={!isHost} onClick={() => toggleGenre(g)}>
                {GENRE_LABELS[g][lang]}
              </Pill>
            ))}
            {s.genres.length === 0 && <span className="text-xs font-black text-slate-500">{t.mpGenreAllHint}</span>}
          </div>
        )}
        {s.topicRule === 'custom' && (
          <div className="flex items-center gap-3">
            <span className={`rounded-lg border-[3px] border-slate-900 px-3 py-0.5 text-base font-black ${view.topicPool ? 'bg-emerald-200' : 'bg-rose-200'}`}>
              📦 {fmt(t.mpTopicPool, { n: view.topicPool })}
            </span>
            <button type="button" tabIndex={-1} onClick={() => setModalOpen(true)} className="comic-btn bg-amber-300 px-4 py-1 text-base">
              {t.mpAddTopic}
            </button>
          </div>
        )}
      </Row>

      {modalOpen && <TopicModal t={t} match={match} onClose={() => setModalOpen(false)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[40px] items-center gap-4">
      <span className="w-20 shrink-0 text-sm font-black tracking-wider text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  disabled,
  onChange,
}: {
  value: T;
  options: [T, string][];
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-xl border-[3px] border-slate-900 shadow-[3px_3px_0_#0f172a]">
      {options.map(([v, label], i) => (
        <button
          key={v}
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`whitespace-nowrap px-3 py-1 text-base font-black ${i ? 'border-l-[3px] border-slate-900' : ''} ${
            value === v ? 'bg-amber-300' : 'bg-white'
          } ${disabled ? 'cursor-default' : 'hover:bg-amber-100'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Choices({
  label,
  value,
  options,
  disabled,
  format = String,
  onChange,
}: {
  label: string;
  value: number;
  options: readonly number[];
  disabled: boolean;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <span className="text-sm font-black text-slate-500">{label}</span>
      {options.map((n) => (
        <Pill key={n} active={value === n} disabled={disabled} onClick={() => onChange(n)}>
          {format(n)}
        </Pill>
      ))}
    </div>
  );
}

function Pill({ active, disabled, small, onClick, children }: { active: boolean; disabled: boolean; small?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      disabled={disabled}
      onClick={onClick}
      className={`whitespace-nowrap rounded-lg border-[3px] border-slate-900 font-black ${small ? 'px-2 py-0.5 text-sm' : 'px-3 py-0.5 text-base'} ${
        active ? 'bg-amber-300 shadow-[2px_2px_0_#0f172a]' : 'bg-white'
      } ${disabled ? 'cursor-default' : 'hover:-translate-y-0.5'}`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------- custom topic modal

function TopicModal({ t, match, onClose }: { t: Dict; match: MatchApi; onClose: () => void }) {
  const [answer, setAnswer] = useState('');
  const [dummies, setDummies] = useState<[string, string, string]>(['', '', '']);
  const [invalid, setInvalid] = useState(false);
  const [saved, setSaved] = useState<CustomTopic[]>(loadSavedTopics);

  // Esc closes; the lobby ignores keys typed into inputs, so no other capture is needed.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    const draft = { answer, dummies };
    if (!isValidTopic(draft)) {
      setInvalid(true);
      return;
    }
    const topic = makeTopic(answer, dummies);
    const next = [...saved, topic];
    saveTopics(next);
    setSaved(next);
    match.addTopics([topic]);
    setAnswer('');
    setDummies(['', '', '']);
    setInvalid(false);
  };

  const remove = (id: string) => {
    const next = saved.filter((x) => x.id !== id);
    saveTopics(next);
    setSaved(next);
    match.removeTopic(id);
  };

  const input = (value: string, onChange: (v: string) => void, placeholder: string, accent = false) => (
    <input
      value={value}
      maxLength={TOPIC_TEXT_MAX}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        setInvalid(false);
      }}
      className={`w-full select-text rounded-xl border-4 border-slate-900 px-3 py-1.5 text-xl font-black outline-none focus:bg-amber-50 ${accent ? 'bg-emerald-50' : ''}`}
    />
  );

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60" onPointerDown={onClose}>
      <form
        className="animate-pop-in comic-card w-[600px] overflow-hidden shadow-[8px_8px_0px_#0f172a]"
        style={{ '--rot': '-1deg' } as CSSProperties}
        onPointerDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="border-b-4 border-slate-900 bg-amber-300 px-6 py-3 text-2xl font-black">✍️ {t.mpTopicModalTitle}</div>
        <div className="flex flex-col gap-3 px-6 py-4">
          <label className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm font-black text-emerald-700">⭕ {t.mpTopicAnswer}</span>
            {input(answer, setAnswer, t.mpTopicExample, true)}
          </label>
          {dummies.map((d, i) => (
            <label key={i} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-sm font-black text-slate-500">❌ {fmt(t.mpTopicDummy, { n: i + 1 })}</span>
              {input(d, (v) => setDummies((prev) => prev.map((x, j) => (j === i ? v : x)) as [string, string, string]), '…')}
            </label>
          ))}
          {invalid && <div className="rounded-lg bg-rose-100 px-3 py-1 text-center text-sm font-black text-rose-700">⚠️ {t.mpTopicInvalid}</div>}

          <div className="mt-1 max-h-[120px] overflow-y-auto rounded-xl border-[3px] border-dashed border-slate-300 px-3 py-2">
            <div className="mb-1 text-xs font-black tracking-wider text-slate-500">{fmt(t.mpMyTopics, { n: saved.length })}</div>
            <div className="flex flex-wrap gap-1.5">
              {saved.map((x) => (
                <span key={x.id} className="flex items-center gap-1 rounded-lg border-2 border-slate-900 bg-amber-100 pl-2 text-sm font-black">
                  {x.answer}
                  <button type="button" tabIndex={-1} onClick={() => remove(x.id)} className="px-1.5 text-rose-600 hover:bg-rose-100" aria-label="delete">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-4 pb-5">
          <button type="submit" tabIndex={-1} className="comic-btn bg-emerald-300 px-8 py-2 text-xl">
            💾 {t.mpTopicSave}
          </button>
          <button type="button" tabIndex={-1} onClick={onClose} className="comic-btn flex items-center gap-2 bg-white px-6 py-2 text-xl">
            {t.close} <span className="key-badge text-sm">Esc</span>
          </button>
        </div>
      </form>
    </div>
  );
}

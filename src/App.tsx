import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { bgm } from './audio/BgmManager';
import { sound } from './audio/SoundManager';
import { GameScreen } from './components/GameScreen';
import { PauseMenu } from './components/PauseMenu';
import { ResultScreen } from './components/ResultScreen';
import { TitleScreen } from './components/TitleScreen';
import { SoloModeModal } from './components/SoloModeModal';
import { MultiplayerScreen } from './multiplayer/MultiplayerScreen';
import { clearInviteFromUrl, parseInvite } from './net/invite';
import { useGameEngine } from './game/useGameEngine';
import { STAGE_H, STAGE_W, useStageScale } from './hooks/useStageScale';
import { useLang } from './hooks/useLang';
import { STRINGS } from './i18n';
import { SettingsProvider } from './settings/SettingsContext';
import { DexProvider } from './dex/DexContext';

/**
 * Dev-only Steam capsule generator, opened at `/#capsules`.
 * `import.meta.env.DEV` is false in production, so it isn't bundled.
 */
const CapsuleGenerator = import.meta.env.DEV ? lazy(() => import('./tools/CapsuleGenerator')) : null;
const CAPSULES_HASH = '#capsules';

/** Physical key codes → answer index (layout-independent: works with JIS/US/AZERTY). */
const ANSWER_KEYS: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Numpad1: 0,
  Numpad2: 1,
  Numpad3: 2,
  Numpad4: 3,
  KeyQ: 0,
  KeyW: 1,
  KeyE: 2,
  KeyR: 3,
};

export default function App() {
  const [lang, setLang] = useLang();
  const scale = useStageScale();
  const engine = useGameEngine();
  const { state, ref, start, answer, setPaused, togglePause, quitToTitle } = engine;
  const t = STRINGS[lang];
  // Online multiplayer runs its own screens and input; the solo engine idles on the title meanwhile.
  // An invite link (?room=BUST-1234&mode=b) skips the title and joins that room.
  const [invite, setInvite] = useState(() => parseInvite(window.location.search));
  const [multiOpen, setMultiOpen] = useState(!!invite);
  useEffect(() => {
    if (invite) clearInviteFromUrl();
  }, [invite]);
  // Title Start opens the solo mode picker; retry/restart replay the same mode.
  const [pickerOpen, setPickerOpen] = useState(false);
  const retry = () => start(ref.current.mode);
  const multiOpenRef = useRef(multiOpen);
  multiOpenRef.current = multiOpen;
  const [capsulesOpen, setCapsulesOpen] = useState(() => !!CapsuleGenerator && window.location.hash === CAPSULES_HASH);
  const closeCapsules = () => {
    setCapsulesOpen(false);
    if (window.location.hash === CAPSULES_HASH) history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  useEffect(() => {
    if (!multiOpen) bgm.setScene(state.phase === 'playing' ? 'game' : 'title');
  }, [multiOpen, state.phase]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t.title;
  }, [lang, t.title]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      sound.unlock();
      bgm.unlock();
      // Multiplayer handles its own keys (and has text inputs that need Space/Enter).
      if (multiOpenRef.current) return;
      const s = ref.current;
      const isConfirm = e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter';
      // We handle these ourselves; stop page scroll / focused-button activation.
      if (isConfirm) e.preventDefault();
      if (e.repeat) return;

      if (e.code === 'Escape') {
        if (s.phase === 'playing') togglePause();
        return;
      }
      if (e.code === 'KeyM') {
        sound.muted = !sound.muted;
        return;
      }
      if (s.phase === 'title' && isConfirm) {
        setPickerOpen(true);
        return;
      }
      if (s.phase === 'result' && isConfirm) {
        start(s.mode);
        return;
      }
      if (s.phase === 'playing') {
        const idx = ANSWER_KEYS[e.code];
        if (idx !== undefined) {
          e.preventDefault();
          answer(idx);
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') e.preventDefault();
    };
    const onPointerDown = () => {
      sound.unlock();
      bgm.unlock();
    };
    // Auto-pause when the window loses focus (alt-tab, Steam overlay, minimize).
    const onBlur = () => setPaused(true);
    const onVisibility = () => document.hidden && setPaused(true);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ref, start, answer, setPaused, togglePause]);

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-slate-900 font-game" onContextMenu={(e) => e.preventDefault()}>
      {/* 16:9 letterboxed stage: laid out at 1280×720 and uniformly scaled to fit the window. */}
      <div className="relative overflow-hidden" style={{ width: STAGE_W * scale, height: STAGE_H * scale }}>
        <div
          className="stage-bg absolute left-0 top-0 origin-top-left text-slate-900"
          style={{ width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
        >
          {/* One settings modal for every screen (each screen's ⚙️ opens it). */}
          <SettingsProvider t={t} lang={lang} onLang={setLang}>
            <DexProvider t={t} lang={lang} scale={scale}>
              {multiOpen && (
                <MultiplayerScreen
                  t={t}
                  lang={lang}
                  scale={scale}
                  autoJoin={invite}
                  onExit={() => {
                    setMultiOpen(false);
                    setInvite(null); // one-shot: reopening multiplayer later shouldn't rejoin
                  }}
                />
              )}

              {!multiOpen && state.phase === 'title' && <TitleScreen t={t} lang={lang} scale={scale} bestScore={state.bestScore} onStart={() => setPickerOpen(true)} onOpenMultiplayer={() => setMultiOpen(true)} />}

              {!multiOpen && state.phase === 'title' && pickerOpen && (
                <SoloModeModal
                  t={t}
                  onClose={() => setPickerOpen(false)}
                  onPick={(mode) => {
                    setPickerOpen(false);
                    start(mode);
                  }}
                />
              )}

              {state.phase === 'playing' && (
                <>
                  <GameScreen state={state} t={t} lang={lang} scale={scale} onAnswer={answer} onPause={() => setPaused(true)} />
                  {state.paused && (
                    <PauseMenu t={t} onResume={() => setPaused(false)} onRestart={retry} onTitle={quitToTitle} />
                  )}
                </>
              )}

              {state.phase === 'result' && <ResultScreen state={state} t={t} lang={lang} onRetry={retry} onTitle={quitToTitle} />}
            </DexProvider>
          </SettingsProvider>
        </div>
      </div>

      {CapsuleGenerator && capsulesOpen && (
        <Suspense fallback={null}>
          <CapsuleGenerator onClose={closeCapsules} />
        </Suspense>
      )}
    </div>
  );
}

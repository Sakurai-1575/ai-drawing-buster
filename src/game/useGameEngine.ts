import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../audio/SoundManager';
import { createGame, createIdleState, step, submitAnswer, type GameState, type SoloMode } from './engine';

/** Owns the mutable game state and the requestAnimationFrame loop that drives it. */
export function useGameEngine() {
  const ref = useRef<GameState>(createIdleState());
  const [, setVersion] = useState(0);
  const commit = useCallback(() => setVersion((v) => (v + 1) % 1_000_000), []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      // Clamp so a background tab or a hitch doesn't skip a whole question.
      const dt = Math.min(now - last, 100);
      last = now;
      if (step(ref.current, dt)) commit();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [commit]);

  const start = useCallback(
    (mode: SoloMode = 'score') => {
      sound.unlock();
      ref.current = createGame(mode);
      sound.gameStart();
      commit();
    },
    [commit],
  );

  if (import.meta.env.DEV) {
    // Dev/e2e handle: read the live state, or fast-forward (e.g. the 3-minute time attack clock).
    (window as unknown as { __solo?: { state: () => GameState } }).__solo = { state: () => ref.current };
  }

  const answer = useCallback(
    (choice: number) => {
      if (submitAnswer(ref.current, choice)) commit();
    },
    [commit],
  );

  const setPaused = useCallback(
    (paused: boolean) => {
      const s = ref.current;
      if (s.phase !== 'playing' || s.paused === paused) return;
      s.paused = paused;
      commit();
    },
    [commit],
  );

  const togglePause = useCallback(() => setPaused(!ref.current.paused), [setPaused]);

  const quitToTitle = useCallback(() => {
    ref.current = createIdleState();
    commit();
  }, [commit]);

  return { state: ref.current, ref, start, answer, setPaused, togglePause, quitToTitle };
}

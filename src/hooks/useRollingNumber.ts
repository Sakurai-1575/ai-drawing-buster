import { useEffect, useRef, useState } from 'react';
import { sound } from '../audio/SoundManager';

const TICK_INTERVAL_MS = 45;

/**
 * Slot-machine style counter: when `target` goes up, the shown value rolls up to it
 * with an ease-out curve and a rapid pip sound. Decreases (a new game) snap instantly.
 * Pass `initial` (e.g. 0) to roll up from it on mount.
 * Returns the value to display and whether it is currently rolling.
 */
export function useRollingNumber(target: number, duration = 700, initial = target): [number, boolean] {
  const [shown, setShown] = useState(initial);
  const shownRef = useRef(initial);

  useEffect(() => {
    const from = shownRef.current;
    if (target <= from) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    let lastTick = -Infinity;
    const t0 = performance.now();
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - k) ** 3;
      const value = k >= 1 ? target : Math.floor(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (k < 1) {
        if (now - lastTick >= TICK_INTERVAL_MS) {
          lastTick = now;
          sound.tick(k);
        }
        raf = requestAnimationFrame(frame);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return [shown, shown !== target];
}

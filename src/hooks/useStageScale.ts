import { useEffect, useState } from 'react';

export const STAGE_W = 1280;
export const STAGE_H = 720;

const compute = () => Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H);

/** Scale factor that fits the fixed 16:9 stage inside the window (letterboxed). */
export function useStageScale() {
  const [scale, setScale] = useState(compute);
  useEffect(() => {
    const onResize = () => setScale(compute());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}


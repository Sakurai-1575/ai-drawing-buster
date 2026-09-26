import { useCallback, useState } from 'react';
import type { MascotLineKind } from '../mascotLines';

export interface MascotEvent {
  /** Increments on every event so repeats of the same kind still retrigger. */
  id: number;
  kind: MascotLineKind;
  vars?: Record<string, string>;
}

/** Event channel for <MascotCommentator>: screens call `say` when something happens. */
export function useMascot() {
  const [event, setEvent] = useState<MascotEvent | null>(null);
  const say = useCallback((kind: MascotLineKind, vars?: Record<string, string>) => {
    setEvent((prev) => ({ id: (prev?.id ?? 0) + 1, kind, vars }));
  }, []);
  return { event, say };
}

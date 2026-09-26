/** Pencil icon geometry (54×54 box, graphite tip at (5, 49)). Shared by the SVG cursor and canvas renders. */
export const PENCIL = {
  body: 'M14 30 L38 6 L48 16 L24 40 Z',
  bodyFill: '#fcd34d',
  eraser: 'M38 6 L42 2 L52 12 L48 16 Z',
  eraserFill: '#fb7185',
  wood: 'M14 30 L24 40 L5 49 Z',
  woodFill: '#fde7c7',
  graphite: 'M5 49 L8.5 41.5 L12.5 45.5 Z',
  size: 54,
  tip: [5, 49] as const,
};

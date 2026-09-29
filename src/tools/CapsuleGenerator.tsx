import { useEffect, useRef, useState } from 'react';
import {
  CAPSULES,
  HERO_SAFE_AREA,
  JPEG_QUALITY,
  capsuleFilename,
  capsuleMime,
  loadCapsuleArt,
  renderCapsule,
  type CapsuleGroup,
  type CapsuleSpec,
} from './capsules';

const DOWNLOAD_GAP_MS = 400;

const GROUPS: { id: CapsuleGroup; title: string }[] = [
  { id: 'store', title: 'ストアアセット / Store Capsules' },
  { id: 'library', title: 'ライブラリアセット / Library Assets' },
  { id: 'icon', title: 'アイコン / Icons' },
];

function downloadCanvas(canvas: HTMLCanvasElement, spec: CapsuleSpec): Promise<void> {
  const filename = capsuleFilename(spec);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`Failed to encode ${filename}`));
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    }, capsuleMime(spec), JPEG_QUALITY);
  });
}

/** Dev-only overlay: previews the Steam store/library assets and downloads them as exact-size PNGs. */
export default function CapsuleGenerator({ onClose }: { onClose: () => void }) {
  const canvases = useRef<Record<string, HTMLCanvasElement | null>>({});
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Make sure the logo font and Buster-kun's art are ready before rasterizing.
    void Promise.all([document.fonts.ready, loadCapsuleArt()]).then(() => {
      if (cancelled) return;
      for (const spec of CAPSULES) {
        const canvas = canvases.current[spec.id];
        if (canvas) renderCapsule(canvas, spec);
      }
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Swallow keys so the title screen behind doesn't start a game; Esc closes.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.code === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [onClose]);

  const downloadOne = (spec: CapsuleSpec) => {
    const canvas = canvases.current[spec.id];
    if (canvas) void downloadCanvas(canvas, spec);
  };

  const downloadMany = async (specs: CapsuleSpec[]) => {
    setBusy(true);
    try {
      for (const spec of specs) {
        const canvas = canvases.current[spec.id];
        if (canvas) await downloadCanvas(canvas, spec);
        // Browsers drop rapid-fire downloads; space them out.
        await new Promise((r) => window.setTimeout(r, DOWNLOAD_GAP_MS));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-900/95 font-game text-slate-900">
      <div className="mx-auto max-w-[1320px] p-6">
        <div className="sticky top-0 z-10 -mx-6 mb-2 flex flex-wrap items-center gap-4 bg-slate-900/95 px-6 py-4">
          <h1 className="text-3xl font-black text-amber-200">🖼 Steam画像一括生成</h1>
          <span className="rounded-md bg-rose-500 px-2 py-0.5 text-xs font-black text-white">DEV ONLY</span>
          <div className="ml-auto flex gap-3">
            <button
              type="button"
              disabled={!ready || busy}
              onClick={() => void downloadMany(CAPSULES)}
              className="comic-btn bg-emerald-300 px-6 py-2 text-xl disabled:opacity-50"
            >
              {busy ? '書き出し中…' : `⬇ 全${CAPSULES.length}枚ダウンロード`}
            </button>
            <button type="button" onClick={onClose} className="comic-btn bg-white px-5 py-2 text-xl">
              ✕ 閉じる <span className="key-badge ml-1 text-sm">Esc</span>
            </button>
          </div>
        </div>

        {GROUPS.map((group) => {
          const specs = CAPSULES.filter((s) => s.group === group.id);
          return (
            <div key={group.id} className="mb-10">
              <div className="mb-4 flex items-center gap-4">
                <h2 className="text-2xl font-black text-white">{group.title}</h2>
                <button
                  type="button"
                  disabled={!ready || busy}
                  onClick={() => void downloadMany(specs)}
                  className="comic-btn bg-amber-200 px-4 py-1 text-base disabled:opacity-50"
                >
                  ⬇ この{specs.length}枚をダウンロード
                </button>
              </div>
              <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                {specs.map((spec) => (
                  <Preview
                    key={spec.id}
                    spec={spec}
                    ready={ready}
                    onDownload={() => downloadOne(spec)}
                    canvasRef={(el) => {
                      canvases.current[spec.id] = el;
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PreviewProps {
  spec: CapsuleSpec;
  ready: boolean;
  onDownload: () => void;
  canvasRef: (el: HTMLCanvasElement | null) => void;
}

function Preview({ spec, ready, onDownload, canvasRef }: PreviewProps) {
  const isHero = spec.id === 'library_hero';
  return (
    <section className={`comic-card flex flex-col gap-3 bg-white p-4 ${isHero ? 'lg:col-span-2' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="text-xl font-black">{spec.label}</h3>
        <span className="rounded-md bg-slate-900 px-2 py-0.5 text-sm font-black tabular-nums text-amber-200">
          {spec.width} × {spec.height} px
        </span>
        <button type="button" disabled={!ready} onClick={onDownload} className="comic-btn ml-auto bg-sky-300 px-4 py-1 text-base disabled:opacity-50">
          ⬇ {spec.width}×{spec.height} {spec.format === 'jpeg' ? 'JPG' : 'PNG'}
        </button>
      </div>
      {/* Checkerboard makes the exact canvas bounds and any transparency visible. */}
      <div className="flex justify-center rounded-lg bg-[conic-gradient(#e2e8f0_25%,#fff_0_50%,#e2e8f0_0_75%,#fff_0)] bg-[length:16px_16px] p-3">
        <div className="relative">
          <canvas
            ref={canvasRef}
            width={spec.width}
            height={spec.height}
            className="block h-auto max-h-[560px] max-w-full outline outline-2 outline-slate-900"
            style={{ aspectRatio: `${spec.width} / ${spec.height}` }}
          />
          {isHero && (
            // Preview-only guide; not part of the exported PNG.
            <div
              className="pointer-events-none absolute border-[3px] border-dashed border-rose-500"
              style={{
                width: `${(HERO_SAFE_AREA.width / spec.width) * 100}%`,
                height: `${(HERO_SAFE_AREA.height / spec.height) * 100}%`,
                left: `${50 - (HERO_SAFE_AREA.width / spec.width) * 50}%`,
                top: `${50 - (HERO_SAFE_AREA.height / spec.height) * 50}%`,
              }}
            />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <code className="text-slate-500">{capsuleFilename(spec)}</code>
        {spec.note && <span className="font-black text-slate-600">※ {spec.note}</span>}
      </div>
    </section>
  );
}


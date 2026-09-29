#!/usr/bin/env python3
"""
Assemble the official trailer of AIお絵描きバスター: promo_assets/trailer_1080p.mp4 (1920x1080, 60 fps, ~40-45 s).

    python scripts/assemble_trailer.py [--no-refresh]

1. Makes sure every source exists and creates only what's missing: voices + phrase timing
   (generate_trailer_voices.py), the game's own SE (render_game_sfx.py), gameplay clips + their markers
   (record_gameplay.py). --no-refresh skips the check.
2. Cuts each scene tightly around the recorded markers (answer pressed, reveal, …) and syncs the voice to
   the action through its phrase timing (e.g. 「はやっ」 on the instant answer, 「ってブッブー」 on the wrong press).
3. Layers the game's SE on the same markers (GO!, CRITICAL, buzzers, countdown, stamps, achievements, …).
4. Telops: heading ribbons at the top; subtitles show only the phrase being spoken, white with a thick
   ink outline and drop shadow (no background band, the game stays visible).
5. BGM (Jailbreak, looped) ducked by 10 dB under every voice line; short crossfades between scenes.

Prints the final duration, file size and each scene's slot on the timeline.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import LINES, find_ffmpeg  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PROMO = ROOT / 'promo_assets'
RAW = PROMO / 'raw_video'
VOICE = PROMO / 'voice'
SE = PROMO / 'se'
OUT = PROMO / 'trailer_1080p.mp4'
BGM = ROOT / 'public' / 'audio' / 'bgm' / 'game-1-jailbreak.mp3'
W, H, FPS = 1920, 1080, 60

XFADE = 0.2  # crossfade between scenes
BGM_GAIN = 0.5  # BGM bed level (before ducking)
DUCK_DB = -10.0  # BGM under Buster-kun's voice
SE_DB = -9.0  # SE bus (files are peak-normalized to -3 dBFS); per-event offsets below
FONT_FILE, FONT_INDEX = 'C:/Windows/Fonts/BIZ-UDGothicB.ttc', 1  # BIZ UDPGothic Bold

CLIPS = {
    'scene1': 'scene1_hook_critical',
    'scene2': 'scene2_rule_mislead',
    'scene2b': 'scene2b_modes',
    'scene3': 'scene3_multiplayer_8p',
    'scene4': 'scene4_volume_dex',
    'scene5': 'scene5_cta',
}
SE_NAMES = ['correct', 'critical', 'critical_combo2', 'critical_max', 'wrong', 'shatter', 'countdown_3', 'countdown_1', 'time_up', 'sweep', 'slam', 'go', 'fanfare', 'click', 'achievement'] + [f'tick_{i}' for i in range(10)]

# ---------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------


def run(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, **kw)


def probe_seconds(ffprobe: str, path: Path) -> float:
    out = run([ffprobe, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)], capture_output=True, text=True).stdout
    return float(out.strip())


def markers(clip: str) -> dict[str, float]:
    return json.loads((RAW / f'{clip}.markers.json').read_text(encoding='utf-8'))


# ---------------------------------------------------------------------------------------------
# Telops (Pillow)
# ---------------------------------------------------------------------------------------------

INK = (15, 23, 42, 255)


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_FILE, size, index=FONT_INDEX)


def heading_png(path: Path, title: str, sub: str | None, color=(252, 211, 77, 255)) -> tuple[int, int]:
    """A tilted comic ribbon: ink border + offset shadow, white text with a thick ink stroke."""
    f1, f2 = font(92), font(50)
    pad_x, pad_y, gap = 56, 26, 12
    tw = int(max(f1.getlength(title), f2.getlength(sub) if sub else 0)) + pad_x * 2
    th = 92 + (gap + 50 if sub else 0) + pad_y * 2 + 16
    img = Image.new('RGBA', (tw + 30, th + 30), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((14, 14, tw + 14, th + 14), radius=30, fill=INK)  # shadow
    d.rounded_rectangle((2, 2, tw, th), radius=30, fill=color, outline=INK, width=8)
    d.text((tw / 2, pad_y), title, font=f1, fill=(255, 255, 255, 255), anchor='ma', stroke_width=10, stroke_fill=INK)
    if sub:
        d.text((tw / 2, pad_y + 92 + gap + 8), sub, font=f2, fill=INK, anchor='ma')
    img = img.rotate(3, resample=Image.BICUBIC, expand=True)
    img.save(path)
    return img.size


def phrase_png(path: Path, text: str) -> tuple[int, int]:
    """One spoken phrase: white text, thick ink outline and a soft drop shadow — no background band."""
    f = font(70)
    tw = int(f.getlength(text)) + 60
    th = 70 + 60
    img = Image.new('RGBA', (tw + 20, th + 20), (0, 0, 0, 0))
    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((tw / 2 + 16, 30 + 8), text, font=f, fill=(15, 23, 42, 210), anchor='ma', stroke_width=12, stroke_fill=(15, 23, 42, 210))
    img.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(4)))
    ImageDraw.Draw(img).text((tw / 2 + 8, 30), text, font=f, fill=(255, 255, 255, 255), anchor='ma', stroke_width=11, stroke_fill=INK)
    img.save(path)
    return img.size


# ---------------------------------------------------------------------------------------------
# Timeline model
# ---------------------------------------------------------------------------------------------


@dataclass
class Telop:
    text: str
    t0: float  # scene-relative
    t1: float
    sub: str | None = None
    color: tuple = (252, 211, 77, 255)


@dataclass
class Scene:
    label: str
    clip: str
    segments: list[tuple[float, float]]  # clip-time (in, out)
    voice: str
    voice_at: float  # scene-relative
    headings: list[Telop] = field(default_factory=list)
    sfx: list[tuple[str, float, float]] = field(default_factory=list)  # (se name, clip time, dB offset)

    @property
    def duration(self) -> float:
        return sum(b - a for a, b in self.segments)

    def to_scene(self, t: float) -> float | None:
        """Clip time → scene time, or None if that moment was cut."""
        acc = 0.0
        for a, b in self.segments:
            if a <= t <= b:
                return acc + t - a
            acc += b - a
        return None

    def fit_voice(self, vlen: float, tail: float, clip_len: float) -> None:
        """Extend the last shot so the line (plus a short tail) finishes inside the scene."""
        need = self.voice_at + vlen + tail - self.duration
        if need > 0:
            a, b = self.segments[-1]
            self.segments[-1] = (a, min(clip_len, b + need))


def build_scenes(ffprobe: str, voices: dict) -> list[Scene]:
    vlen = {n: v['seconds'] for n, v in voices.items()}
    anchor = {n: v['anchor'] for n, v in voices.items()}
    clip_len = {k: probe_seconds(ffprobe, RAW / f'{c}.mp4') for k, c in CLIPS.items()}
    scenes: list[Scene] = []

    # 1. Hook — title, then 「はやっ！？」 right on the instant answer; a second GOD SPEED for the combo.
    m, c = markers(CLIPS['scene1']), CLIPS['scene1']
    a = max(0.0, m['answer1'] + 0.1 - anchor['01_hook_esper'] - 0.2)
    s = Scene('ツカミ：神速即答', c, [(a, m['answer2'] + 1.4)], '01_hook_esper', m['answer1'] + 0.1 - anchor['01_hook_esper'] - a)
    s.fit_voice(vlen['01_hook_esper'], 0.2, clip_len['scene1'])
    s.headings += [
        Telop('最速0.5秒即答！？', m['start'] - a, m['answer1'] - a + 0.1),
        Telop('GOD SPEED!!', m['answer2'] - a - 0.05, s.duration - 0.05, color=(251, 113, 133, 255)),
    ]
    s.sfx += [('click', m['start'], -6), ('go', m['live1'] - 0.4, 0), ('critical', m['answer1'], 0), ('achievement', m['answer1'] + 0.12, -5),
              ('critical_combo2', m['answer2'], 0)]
    scenes.append(s)

    # 2. Rule + trap — 「ってブッブー」 on the first wrong press, a flash of the second, then the time-up laugh.
    m, c = markers(CLIPS['scene2']), CLIPS['scene2']
    a1 = max(0.0, m['wrong1'] - anchor['02_rule_mislead'] - 0.08)
    segs = [(a1, m['wrong1'] + 1.2), (m['wrong2'] - 0.25, m['wrong2'] + 0.9), (m['timeup'] - 0.1, m['timeup'] + 1.9)]
    s = Scene('基本ルール＆AIの罠', c, segs, '02_rule_mislead', 0.0)
    s.fit_voice(vlen['02_rule_mislead'], 0.25, clip_len['scene2'])
    s.headings += [
        Telop('AIが描く線画クイズ！', 0.1, m['wrong1'] - a1),
        Telop('ミスリードに騙されるな！', m['wrong1'] - a1 + 0.03, s.duration - 0.05, color=(251, 113, 133, 255)),
    ]
    s.sfx += [('go', m['live'] - 0.4, 0), ('wrong', m['wrong1'], 0), ('wrong', m['wrong2'], 0),
              ('time_up', m['timeup'], 0), ('sweep', m['timeup'], -4), ('slam', m['timeup'] + 0.2, -2)]
    scenes.append(s)

    # 3. Solo modes — sweep over the three cards, pick Sudden Death, a heart shatters, then a save.
    m, c = markers(CLIPS['scene2b']), CLIPS['scene2b']
    segs = [(m['hover_スコアアタック'] - 0.15, m['pick'] + 0.25), (m['wrong'] - 0.25, m['wrong'] + 1.0), (m['answer'] - 0.1, m['answer'] + 0.9)]
    s = Scene('3つのソロモード', c, segs, '02b_modes', 0.1)
    s.fit_voice(vlen['02b_modes'], 0.2, clip_len['scene2b'])
    s.headings += [Telop('3つのソロモード！', 0.1, s.duration - 0.05, sub='スコアアタック ／ サドンデス ／ タイムアタック')]
    s.sfx += [('click', m['pick'], -4), ('wrong', m['wrong'], -2), ('shatter', m['wrong'] + 0.06, 0), ('correct', m['answer'], 0)]
    scenes.append(s)

    # 4. 8-player online — READY 3-2-1, the buzzer race (every buzz, miss and stamp), then the standings.
    m, c = markers(CLIPS['scene3']), CLIPS['scene3']
    segs = [(m['start'] - 0.4, m['host_answer'] + 1.6), (m['round_end'] - 0.05, m['round_end'] + 1.8)]
    s = Scene('8人オンライン対戦', c, segs, '03_multiplayer_8p', 0.3)
    s.fit_voice(vlen['03_multiplayer_8p'], 0.2, clip_len['scene3'])
    live = m['live']
    s.headings += [
        Telop('最大8人オンライン対戦！', 0.1, live - segs[0][0]),
        Telop('早押しミリ秒バトル！', live - segs[0][0] + 0.03, s.duration - 0.05, color=(125, 211, 252, 255)),
    ]
    s.sfx += [('countdown_3', live - 1.8, -2), ('countdown_3', live - 1.2, -2), ('countdown_1', live - 0.6, -2), ('go', live, 0),
              ('correct', m['host_answer'], 0), ('slam', m['round_end'], -3)]
    stamp_n = 0
    for name, t in sorted(m.items(), key=lambda kv: kv[1]):
        if not name.startswith('bot'):
            continue
        t += 0.08  # what the host hears: the message has to arrive first
        if '_correct_' in name:
            s.sfx.append(('click', t, -3))
        elif '_wrong_' in name:
            s.sfx.append(('wrong', t, -8))
        elif '_stamp_' in name:
            s.sfx.append((f'tick_{min(stamp_n, 9)}', t, -1))
            stamp_n += 1
    scenes.append(s)

    # 5. Volume — CRITICAL + 限界突破 achievement, the 1.5x drawing, Dex tabs flipping, achievements.
    m, c = markers(CLIPS['scene4']), CLIPS['scene4']
    segs = [(m['answer30'] - 0.2, m['answer31'] + 0.7), (m['dex_open'] + 0.3, m['tab3'] + 0.3), (m['ach_open'] - 0.05, m['ach_open'] + 1.3)]
    s = Scene('圧倒的ボリューム', c, segs, '04_volume_dex', 0.2)
    s.fit_voice(vlen['04_volume_dex'], 0.2, clip_len['scene4'])
    dex_at = segs[0][1] - segs[0][0]
    s.headings += [
        Telop('全500問収録！', 0.1, dex_at),
        Telop('図鑑＆実績コンプリートを目指せ！', dex_at + 0.03, s.duration - 0.05, color=(134, 239, 172, 255)),
    ]
    s.sfx += [('critical_max', m['answer30'], 0), ('achievement', m['answer30'] + 0.12, -1), ('critical_max', m['answer31'], 0),
              ('click', m['ach_open'], -2)]
    s.sfx += [('click', t, -2) for k, t in m.items() if k.startswith('tab')]
    scenes.append(s)

    # 6. End card + CTA.
    m, c = markers(CLIPS['scene5']), CLIPS['scene5']
    s = Scene('締め＆CTA', c, [(m['in'], m['in'] + 5.6)], '05_cta_steam', 0.5)
    s.fit_voice(vlen['05_cta_steam'], 1.6, clip_len['scene5'])  # let the end card linger
    s.sfx += [('go', m['in'] + 0.25, -2), ('fanfare', m['in'] + 1.0, -7)]
    scenes.append(s)
    return scenes


# ---------------------------------------------------------------------------------------------
# Render
# ---------------------------------------------------------------------------------------------


def render(scenes: list[Scene], voices: dict, ffmpeg: str, tmp: Path) -> tuple[float, list[float]]:
    starts, t = [], 0.0
    for i, s in enumerate(scenes):
        starts.append(t)
        t += s.duration - (XFADE if i < len(scenes) - 1 else 0)
    total = t

    args: list[str] = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
    fc: list[str] = []
    n = 0

    # Video: every shot is its own accurately-seeked input; hard cuts inside a scene, crossfades between.
    labels = []
    for i, s in enumerate(scenes):
        parts = []
        for a, b in s.segments:
            args += ['-ss', f'{a:.3f}', '-t', f'{b - a:.3f}', '-i', str(RAW / f'{s.clip}.mp4')]
            fc.append(f'[{n}:v]fps={FPS},scale={W}:{H},setsar=1,format=yuv420p,setpts=PTS-STARTPTS[s{n}]')
            parts.append(f'[s{n}]')
            n += 1
        fc.append(f'{"".join(parts)}concat=n={len(parts)}:v=1:a=0,settb=1/{FPS * 1000},fps={FPS}[sc{i}]')
        labels.append(f'[sc{i}]')
    cur = labels[0]
    for i in range(1, len(scenes)):
        fc.append(f'{cur}{labels[i]}xfade=transition=fade:duration={XFADE}:offset={starts[i]:.3f}[x{i}]')
        cur = f'[x{i}]'
    fc.append(f'{cur}fade=t=in:st=0:d=0.25,fade=t=out:st={total - 0.6:.3f}:d=0.6[vbase]')
    cur = '[vbase]'

    # Telops: headings (top) + the spoken phrase (bottom).
    overlays = []  # (png, x, y, t0, t1, fade)
    k = 0
    for i, s in enumerate(scenes):
        for h in s.headings:
            png = tmp / f'h{k}.png'
            w, hh = heading_png(png, h.text, h.sub, h.color)
            overlays.append((png, (W - w) // 2, 24, starts[i] + h.t0, starts[i] + h.t1, 0.12))
            k += 1
        caps = voices[s.voice]['captions']
        v0 = starts[i] + s.voice_at
        for j, cap in enumerate(caps):
            t0 = v0 + cap['start'] - 0.04
            t1 = v0 + (caps[j + 1]['start'] - 0.04 if j + 1 < len(caps) else cap['end'] + 0.3)
            png = tmp / f'c{k}.png'
            w, hh = phrase_png(png, cap['text'])
            overlays.append((png, (W - w) // 2, H - hh - 40, t0, t1, 0.05))
            k += 1
    for j, (png, x, y, t0, t1, fd) in enumerate(overlays):
        t0, t1 = max(0.0, t0), min(total, t1)
        dur = max(0.15, t1 - t0)
        args += ['-loop', '1', '-framerate', str(FPS), '-t', f'{dur:.3f}', '-i', str(png)]
        fc.append(
            f'[{n}:v]format=rgba,fade=t=in:st=0:d={fd}:alpha=1,fade=t=out:st={max(0, dur - fd):.3f}:d={fd}:alpha=1,'
            f'setpts=PTS-STARTPTS+{t0:.3f}/TB[tp{j}]'
        )
        fc.append(f"{cur}[tp{j}]overlay=x={x}:y={y}:eof_action=pass:enable='between(t,{t0:.3f},{t1:.3f})'[ov{j}]")
        cur = f'[ov{j}]'
        n += 1
    fc.append(f'{cur}format=yuv420p[vout]')

    # Audio: voices, SE events, and the BGM ducked under the voices.
    mix, spans = [], []
    for i, s in enumerate(scenes):
        at = starts[i] + s.voice_at
        args += ['-i', str(VOICE / f'{s.voice}.wav')]
        fc.append(f'[{n}:a]aresample=48000,adelay={int(at * 1000)}:all=1[v{i}]')
        mix.append(f'[v{i}]')
        spans.append((at, at + voices[s.voice]['seconds']))
        n += 1
    se_count = 0
    for i, s in enumerate(scenes):
        for name, clip_t, db in s.sfx:
            st = s.to_scene(clip_t)
            if st is None:
                continue  # that moment was cut
            at = starts[i] + st
            if at < 0 or at > total - 0.1:
                continue
            args += ['-i', str(SE / f'{name}.wav')]
            fc.append(f'[{n}:a]aresample=48000,volume={SE_DB + db}dB,adelay={int(at * 1000)}:all=1[e{se_count}]')
            mix.append(f'[e{se_count}]')
            n += 1
            se_count += 1
    duck = 1 - 10 ** (DUCK_DB / 20)
    ramps = [f'clip(min((t-{a - 0.15:.3f})/0.15,({b + 0.25:.3f}-t)/0.25),0,1)' for a, b in spans]
    env = ramps[0]
    for r in ramps[1:]:
        env = f'max({env},{r})'
    args += ['-stream_loop', '-1', '-i', str(BGM)]
    fc.append(
        f"[{n}:a]aresample=48000,atrim=0:{total:.3f},asetpts=PTS-STARTPTS,volume={BGM_GAIN},"
        f"volume='1-{duck:.4f}*{env}':eval=frame,afade=t=in:st=0:d=0.3,afade=t=out:st={total - 1.2:.3f}:d=1.2[bgm]"
    )
    n += 1
    fc.append(f'[bgm]{"".join(mix)}amix=inputs={len(mix) + 1}:normalize=0:duration=first,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=48000[aout]')

    script = tmp / 'graph.txt'
    script.write_text(';\n'.join(fc), encoding='utf-8')
    args += [
        '-/filter_complex', str(script),  # FFmpeg 7+: read the graph from a file
        '-map', '[vout]', '-map', '[aout]',
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-r', str(FPS), '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
        '-t', f'{total:.3f}', '-movflags', '+faststart', str(OUT),
    ]
    run(args)
    print(f'  ({se_count} SE events, {len(overlays)} telops)')
    return total, starts


# ---------------------------------------------------------------------------------------------


def ensure_sources(refresh: bool) -> None:
    if not refresh:
        return
    voices_json = VOICE / 'voices.json'
    have = json.loads(voices_json.read_text(encoding='utf-8')) if voices_json.exists() else {}
    if any('captions' not in have.get(l.name, {}) or not (VOICE / f'{l.name}.wav').exists() for l in LINES):
        print('Generating voices (with phrase timing)…')
        run([sys.executable, str(ROOT / 'scripts' / 'generate_trailer_voices.py')])
    if any(not (SE / f'{n}.wav').exists() for n in SE_NAMES):
        print('Rendering game SE…')
        run([sys.executable, str(ROOT / 'scripts' / 'render_game_sfx.py')])
    missing = [k for k, c in CLIPS.items() if not (RAW / f'{c}.mp4').exists() or not (RAW / f'{c}.markers.json').exists()]
    if missing:
        print(f'Recording missing scenes: {missing}')
        run([sys.executable, str(ROOT / 'scripts' / 'record_gameplay.py'), '--only', ','.join(missing)])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--no-refresh', action='store_true', help="don't generate/record missing sources")
    args = ap.parse_args()
    ensure_sources(not args.no_refresh)

    ffmpeg = find_ffmpeg()
    ffprobe = str(Path(ffmpeg).with_name('ffprobe' + Path(ffmpeg).suffix))
    voices = json.loads((VOICE / 'voices.json').read_text(encoding='utf-8'))
    scenes = build_scenes(ffprobe, voices)
    with tempfile.TemporaryDirectory(prefix='adb_trailer_') as tmp:
        planned, starts = render(scenes, voices, ffmpeg, Path(tmp))

    real = probe_seconds(ffprobe, OUT)
    size = OUT.stat().st_size
    print(f'\n完成: {OUT}')
    print(f'  尺 {real:.2f}s（計画 {planned:.2f}s） / {size / 1024 / 1024:.1f} MB / 1920x1080 60fps / BGM ducking {DUCK_DB:+.0f} dB')
    for i, s in enumerate(scenes):
        print(f'  {i + 1}. {s.label:<12} {starts[i]:6.2f}s – {starts[i] + s.duration:6.2f}s  ({s.duration:5.2f}s)  voice {s.voice} @ {starts[i] + s.voice_at:.2f}s')
    print(f'  (シーン間クロスフェード {XFADE}s)')


if __name__ == '__main__':
    main()

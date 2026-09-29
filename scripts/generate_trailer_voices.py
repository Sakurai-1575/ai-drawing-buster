#!/usr/bin/env python3
"""
Generate Buster-kun's trailer narration for AIお絵描きバスター.

    python scripts/generate_trailer_voices.py [--speaker "ずんだもん/ツンツン"] [--only 03] [--list-speakers]

For every line: VOICEVOX (local engine, http://127.0.0.1:50021) renders the raw voice, then FFmpeg
runs it through a "retro PC / tiny speaker / robot" chain. Writes:

    promo_assets/voice/raw/<name>.wav     VOICEVOX output, untouched (re-process without re-synthesizing)
    promo_assets/voice/<name>.wav         processed, 48 kHz stereo 16-bit (ready for a video timeline)
    promo_assets/voice/voices.json        subtitle text, speaker, duration of each file (for later steps)

The VOICEVOX engine is started automatically if it isn't running (the default Windows install path is
tried). Standard library only; needs FFmpeg on PATH or from winget.

Credits: VOICEVOX voices require a credit line in the video/store page, e.g. 「VOICEVOX:ずんだもん」.
The script prints the exact line for the speaker it used.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import wave
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'promo_assets' / 'voice'
RAW_DIR = OUT_DIR / 'raw'

ENGINE_URL = 'http://127.0.0.1:50021'
ENGINE_EXE_CANDIDATES = [
    os.path.expandvars(r'%ProgramFiles%\VOICEVOX\vv-engine\run.exe'),
    os.path.expandvars(r'%LOCALAPPDATA%\Programs\VOICEVOX\vv-engine\run.exe'),
]

# ---------------------------------------------------------------------------------------------
# Voice direction
# ---------------------------------------------------------------------------------------------
# ==== バスターくん公式ボイスプリセット（2026-09-28 確定：voice_test の sample_A） ====
# Cheeky but lovable toy robot cat: 猫使ビィ's own cute delivery, slightly faster and higher, through a
# thin toy-speaker chain (see ROBOT_FILTER). Credit: 「VOICEVOX:猫使ビィ」.
# The first speaker/style found wins; override with --speaker "名前/スタイル" (tests only).
SPEAKER_PREFERENCE = [
    ('猫使ビィ', 'ノーマル'),
]

# Global delivery. Voice = sample_A (speaker, pitch, intonation, filter); tempo raised for the trailer
# (2026-09-28: 1.12 -> 1.22, pauses at 55%). Lines may nudge speed/intonation for their acting.
BASE_PARAMS = {
    'speedScale': 1.22,
    'pitchScale': 0.04,  # VOICEVOX range is roughly -0.15..0.15; more starts to sound chipmunk-y
    'intonationScale': 1.4,
    'volumeScale': 1.0,
    'prePhonemeLength': 0.03,
    'postPhonemeLength': 0.08,
    'pauseLengthScale': 0.55,  # tighter gaps at punctuation
}


@dataclass
class Line:
    name: str
    text: str
    """What Buster-kun says, as written (voices.json)."""
    tts: str = ''
    """Reading fed to VOICEVOX when the written text would be misread (www, Steam, 8人, ...)."""
    params: dict = field(default_factory=dict)
    captions: list[tuple[str, int]] = field(default_factory=list)
    """Subtitles phrase by phrase: (text, how many VOICEVOX pause-groups it covers). The groups come from
    the synthesis (one per pause at punctuation), so each caption switches exactly when that phrase is spoken."""
    anchor: int = 0
    """Pause-group (0-based) whose start the trailer syncs to the action (e.g. 「はやっ」 on the answer)."""


LINES = [
    Line(
        '01_hook_esper',
        'ボクが描いたの、何秒で見抜けるニャ？……って、はやっ！？ズルしてないかニャ！？',
        captions=[('ボクが描いたの、', 1), ('何秒で見抜けるニャ？', 1), ('……って、はやっ！？', 2), ('ズルしてないかニャ！？', 1)],
        anchor=3,  # 「はやっ」 on the instant answer
    ),
    Line(
        '02_rule_mislead',
        'AIがリアルタイムに描く線画クイズ！……ってブッブー！引っかかった〜！最初の線はウソでしたニャwww',
        # "www" would be read letter by letter; laugh instead.
        tts='エーアイがリアルタイムに描く線画クイズ！……ってブッブー！引っかかった〜！最初の線はウソでしたニャ、ニャハハハ！',
        params={'speedScale': 1.24, 'intonationScale': 1.45},
        captions=[('AIがリアルタイムに描く線画クイズ！', 1), ('……ってブッブー！', 1), ('引っかかった〜！', 1), ('最初の線はウソでしたニャwww', 2)],
        anchor=1,  # 「ってブッブー」 on the wrong press
    ),
    Line(
        '02b_modes',
        # Matches the game: Score Attack / Sudden Death (3 lives, speeds up) / Time Attack (3 minutes).
        'じっくり狙うスコアアタックに、ライフ3つで加速するサドンデス、3分勝負のタイムアタックも搭載ニャ！',
        tts='じっくり狙うスコアアタックに、ライフみっつで加速するサドンデス、さんぷん勝負のタイムアタックも搭載ニャ！',
        params={'speedScale': 1.26},
        captions=[('じっくり狙うスコアアタックに、', 1), ('ライフ3つで加速するサドンデス、', 1), ('3分勝負のタイムアタックも搭載ニャ！', 1)],
    ),
    Line(
        '03_multiplayer_8p',
        'さらに！最大8人のオンライン対戦対応！友達同士で叫び合えニャ！',
        # 「最大はちにん」 is read サイダイ"ワ"チニン (は as a particle): katakana.
        tts='さらに！最大ハチニンのオンライン対戦対応！友達同士で叫び合えニャ！',
        params={'intonationScale': 1.4, 'volumeScale': 1.05},
        captions=[('さらに！', 1), ('最大8人のオンライン対戦対応！', 1), ('友達同士で叫び合えニャ！', 1)],
    ),
    Line(
        '04_volume_dex',
        'たっぷり遊べる500問！図鑑に実績、全部コンプできるかニャ？',
        tts='たっぷり遊べる、ごひゃくもん！図鑑に実績、全部コンプできるかニャ？',
        captions=[('たっぷり遊べる500問！', 2), ('図鑑に実績、', 1), ('全部コンプできるかニャ？', 1)],
    ),
    Line(
        '05_cta_steam',
        '『AIお絵描きバスター』！Steamストアでウィッシュリスト登録よろしくニャ！',
        # Title a touch slower and clear; "Steam" as スチーム.
        tts='エーアイお絵描きバスター！スチームストアで、ウィッシュリスト登録よろしくニャ！',
        params={'speedScale': 1.15, 'intonationScale': 1.3},
        captions=[('『AIお絵描きバスター』！', 1), ('Steamストアで', 1), ('ウィッシュリスト登録よろしくニャ！', 1)],
    ),
]


def phrase_groups(query: dict) -> list[tuple[float, float]]:
    """(start, end) in seconds of each pause-separated group, from the audio_query VOICEVOX synthesized."""
    speed = query.get('speedScale') or 1.0
    pause_scale = query.get('pauseLengthScale') or 1.0
    t = query.get('prePhonemeLength', 0.0)
    groups, start = [], None
    for ap in query['accent_phrases']:
        for m in ap['moras']:
            if start is None:
                start = t
            t += (m.get('consonant_length') or 0.0) + m['vowel_length']
        if ap.get('pause_mora'):
            groups.append((start, t))
            start = None
            t += ap['pause_mora']['vowel_length'] * pause_scale
    if start is not None:
        groups.append((start, t))
    return [(a / speed, b / speed) for a, b in groups]


# ---------------------------------------------------------------------------------------------
# FFmpeg: toy speaker (official preset, sample_A) — light enough that the cuteness stays
# ---------------------------------------------------------------------------------------------
# 1. small-speaker band 280 Hz–6.5 kHz   2. plastic-casing mid bump   3. one very short reflection (casing)
# 4. a thin bit-crush for retro digital grit   5. gentle compression, loudness for the edit (-16 LUFS, -1.5 dBTP)
ROBOT_FILTER = ','.join(
    [
        'highpass=f=280:poles=2',
        'lowpass=f=6500:poles=2',
        'equalizer=f=1900:t=q:w=1.2:g=3',
        'aecho=0.9:0.6:4:0.18',
        'acrusher=bits=12:mode=log:aa=1:mix=0.15',
        'acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=2',
        'loudnorm=I=-16:TP=-1.5:LRA=7',
        'aresample=48000',
    ]
)

# ---------------------------------------------------------------------------------------------
# VOICEVOX
# ---------------------------------------------------------------------------------------------


def http(method: str, path: str, query: dict | None = None, body: bytes | None = None, timeout: float = 60) -> bytes:
    url = ENGINE_URL + path + ('?' + urllib.parse.urlencode(query) if query else '')
    req = urllib.request.Request(url, data=body, method=method, headers={'Content-Type': 'application/json'} if body else {})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read()


def engine_version() -> str | None:
    try:
        return json.loads(http('GET', '/version', timeout=3))
    except (urllib.error.URLError, OSError, ValueError):
        return None


def ensure_engine() -> str:
    version = engine_version()
    if version:
        return version
    exe = next((p for p in ENGINE_EXE_CANDIDATES if Path(p).exists()), None)
    if not exe:
        sys.exit(f'VOICEVOX engine is not running at {ENGINE_URL} and run.exe was not found. Start VOICEVOX and retry.')
    print(f'Starting VOICEVOX engine: {exe}')
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    subprocess.Popen([exe], cwd=str(Path(exe).parent), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=flags)
    for _ in range(120):  # first start loads the models: can take a while
        time.sleep(1)
        version = engine_version()
        if version:
            return version
    sys.exit('VOICEVOX engine did not come up within 120 s.')


def list_styles() -> list[tuple[str, str, int]]:
    speakers = json.loads(http('GET', '/speakers'))
    return [(sp['name'], st['name'], st['id']) for sp in speakers for st in sp['styles']]


def pick_style(styles: list[tuple[str, str, int]], override: str | None) -> tuple[str, str, int]:
    wanted = [tuple(override.split('/', 1))] if override else SPEAKER_PREFERENCE
    for name, style in wanted:
        for s in styles:
            if s[0] == name and s[1] == style:
                return s
    if override:
        sys.exit(f'Speaker "{override}" not found. Run with --list-speakers.')
    return styles[0]


def synthesize(text: str, style_id: int, params: dict, with_query: bool = False):
    query = json.loads(http('POST', '/audio_query', {'text': text, 'speaker': style_id}))
    query.update(params)
    wav = http('POST', '/synthesis', {'speaker': style_id}, json.dumps(query).encode('utf-8'), timeout=180)
    return (wav, query) if with_query else wav


# ---------------------------------------------------------------------------------------------
# FFmpeg
# ---------------------------------------------------------------------------------------------


def find_ffmpeg() -> str:
    found = shutil.which('ffmpeg')
    if found:
        return found
    pattern = os.path.expandvars(r'%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg*\*\bin\ffmpeg.exe')
    hits = sorted(glob.glob(pattern))
    if hits:
        return hits[-1]
    sys.exit('FFmpeg not found. Install it (e.g. `winget install Gyan.FFmpeg`) or put it on PATH.')


def robotize(ffmpeg: str, src: Path, dst: Path) -> None:
    cmd = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(src), '-af', ROBOT_FILTER, '-ac', '2', '-c:a', 'pcm_s16le', str(dst)]
    subprocess.run(cmd, check=True)


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), 'rb') as w:
        return w.getnframes() / w.getframerate()


# ---------------------------------------------------------------------------------------------


def render_lines(lines: list[Line], out_dir: Path, speaker_override: str | None = None, quiet: bool = False) -> dict:
    """Synthesize + robotize `lines` into out_dir (raw/ keeps the VOICEVOX originals) and merge their
    entries (seconds, phrase captions, anchor) into out_dir/voices.json. Returns the whole manifest."""
    version = ensure_engine()
    speaker, style, style_id = pick_style(list_styles(), speaker_override)
    ffmpeg = find_ffmpeg()
    raw_dir = out_dir / 'raw'
    raw_dir.mkdir(parents=True, exist_ok=True)
    if not quiet:
        print(f'VOICEVOX {version} — {speaker}/{style} (id {style_id})')
        print(f'FFmpeg   {ffmpeg}\n')

    manifest_path = out_dir / 'voices.json'
    try:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        manifest = {}

    for line in lines:
        raw = raw_dir / f'{line.name}.wav'
        out = out_dir / f'{line.name}.wav'
        wav, query = synthesize(line.tts or line.text, style_id, {**BASE_PARAMS, **line.params}, with_query=True)
        raw.write_bytes(wav)
        robotize(ffmpeg, raw, out)
        seconds = wav_seconds(out)
        # Phrase timing for subtitles/sync, calibrated to the real file length.
        groups = phrase_groups(query)
        k = wav_seconds(raw) / (groups[-1][1] + query.get('postPhonemeLength', 0.0) / (query.get('speedScale') or 1.0))
        groups = [(a * k, b * k) for a, b in groups]
        captions, i = [], 0
        for text, n in line.captions or [(line.text, len(groups))]:
            span = groups[i : i + n] or groups[-1:]
            captions.append({'text': text, 'start': round(span[0][0], 3), 'end': round(span[-1][1], 3)})
            i += n
        if line.captions and i != len(groups):
            print(f'  ! {line.name}: captions cover {i} pause-groups, the synthesis has {len(groups)}')
        manifest[line.name] = {
            'file': out.relative_to(ROOT).as_posix(),
            'text': line.text,
            'speaker': f'{speaker}/{style}',
            'seconds': round(seconds, 2),
            'captions': captions,
            'anchor': round(groups[min(line.anchor, len(groups) - 1)][0], 3),
        }
        if not quiet:
            print(f'  {seconds:5.2f}s  {out}')
            print(f'          「{line.text}」')

    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--speaker', help='VOICEVOX speaker as "名前/スタイル" (default: first available of the preference list)')
    ap.add_argument('--only', help='generate only lines whose name starts with this (e.g. 03)')
    ap.add_argument('--list-speakers', action='store_true', help='print available speakers/styles and exit')
    args = ap.parse_args()

    if args.list_speakers:
        ensure_engine()
        for name, style, sid in list_styles():
            print(f'{sid:4d}  {name}/{style}')
        return

    lines = [l for l in LINES if not args.only or l.name.startswith(args.only)]
    manifest = render_lines(lines, OUT_DIR, args.speaker)
    total = sum(v['seconds'] for v in manifest.values())
    speaker = next(iter(manifest.values()))['speaker'].split('/')[0] if manifest else '?'
    print(f'\nSaved to {OUT_DIR}  ({len(manifest)} files, {total:.2f}s total)')
    print(f'Credit line for the video / store page: 「VOICEVOX:{speaker}」')


if __name__ == '__main__':
    main()

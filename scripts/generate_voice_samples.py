#!/usr/bin/env python3
"""
A/B/C voice tests for Buster-kun: the same line (01_hook_esper) in three "cute retro robot cat" takes.

    python scripts/generate_voice_samples.py

Writes promo_assets/voice_test/sample_{A,B,C}.wav (48 kHz stereo) + raw/ (untouched VOICEVOX output)
and prints each take's speaker, VOICEVOX parameters and FFmpeg chain.

Pitch and formants are moved separately with FFmpeg (rubberband):
  asetrate × F  → pitch and formants both × F (and faster)
  rubberband tempo=1/F, pitch=P/F, formant=preserved → duration back, pitch ends at × P, formants stay × F
So F > 1 = smaller "body" (childlike / mascot), F < 1 = bigger (boyish), independent of how high it sounds.
Reuses the engine/FFmpeg helpers from generate_trailer_voices.py.
"""
from __future__ import annotations

import math
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_trailer_voices import LINES, ROOT, ensure_engine, find_ffmpeg, list_styles, synthesize, wav_seconds  # noqa: E402

OUT_DIR = ROOT / 'promo_assets' / 'voice_test'
RAW_DIR = OUT_DIR / 'raw'
LINE = next(l for l in LINES if l.name == '01_hook_esper')
SOURCE_RATE = 24000  # VOICEVOX output rate


@dataclass
class Take:
    name: str
    concept: str
    speaker: str
    style: str
    voicevox: dict
    pitch: float
    """Final pitch factor (1.0 = as VOICEVOX rendered it)."""
    formant: float
    """Formant factor: >1 smaller/cuter body, <1 bigger/boyish."""
    fx: list[tuple[str, str]]
    """(label, ffmpeg filter) applied after the pitch/formant stage."""


# Shared finishing: gentle glue + loudness for the edit (same target as the trailer lines).
FINISH = [
    ('コンプ（軽め）', 'acompressor=threshold=-20dB:ratio=2.5:attack=5:release=100:makeup=2'),
    ('ラウドネス -16 LUFS / -1.5 dBTP', 'loudnorm=I=-16:TP=-1.5:LRA=7'),
]

TAKES = [
    Take(
        'A',
        '猫使ビィベース：地声の可愛さを活かし、おもちゃスピーカーを薄く',
        '猫使ビィ',
        'ノーマル',
        {'speedScale': 1.12, 'pitchScale': 0.04, 'intonationScale': 1.4, 'volumeScale': 1.0, 'prePhonemeLength': 0.05, 'postPhonemeLength': 0.12},
        pitch=1.0,
        formant=1.0,
        fx=[
            ('小型スピーカー帯域 280Hz〜6.5kHz', 'highpass=f=280:poles=2,lowpass=f=6500:poles=2'),
            ('プラ筐体の中域 +3dB @1.9kHz', 'equalizer=f=1900:t=q:w=1.2:g=3'),
            ('ごく短い反射（筐体鳴り）', 'aecho=0.9:0.6:4:0.18'),
            ('薄いビットクラッシュ 12bit / mix 15%', 'acrusher=bits=12:mode=log:aa=1:mix=0.15'),
        ],
    ),
    Take(
        'B',
        '春日部つむぎベース：ピッチ↑＋フォルマント少し↑でマスコット寄り、軽い電子エコー',
        '春日部つむぎ',
        'ノーマル',
        {'speedScale': 1.1, 'pitchScale': 0.0, 'intonationScale': 1.45, 'volumeScale': 1.0, 'prePhonemeLength': 0.05, 'postPhonemeLength': 0.2},
        pitch=2 ** (2.5 / 12),  # +2.5 semitones
        formant=1.07,
        fx=[
            ('レトロゲーム機の帯域 250Hz〜7kHz', 'highpass=f=250:poles=2,lowpass=f=7000:poles=2'),
            ('明るさ +2.5dB @2.6kHz', 'equalizer=f=2600:t=q:w=1.5:g=2.5'),
            ('電子エコー 70ms / 140ms（薄め）', 'aecho=0.85:0.55:70|140:0.22|0.1'),
            ('ゆるいフランジャー（キラッとした電子感）', 'flanger=delay=1.5:depth=1.5:regen=-20:width=45:speed=0.35'),
            ('薄いビットクラッシュ 12bit / mix 12%', 'acrusher=bits=12:mode=log:aa=1:mix=0.12'),
        ],
    ),
    Take(
        'C',
        'ずんだもんベースの変調：ピッチ少し↓＋フォルマント大きく↓で別人化、抑揚だけ残してロボ加工',
        'ずんだもん',
        'ノーマル',
        {'speedScale': 1.12, 'pitchScale': 0.02, 'intonationScale': 1.55, 'volumeScale': 1.0, 'prePhonemeLength': 0.05, 'postPhonemeLength': 0.12},
        pitch=2 ** (-1.5 / 12),  # −1.5 semitones
        formant=0.86,
        fx=[
            ('小型スピーカー帯域 300Hz〜5.5kHz', 'highpass=f=300:poles=2,lowpass=f=5500:poles=2'),
            ('箱鳴り +4dB @1.5kHz', 'equalizer=f=1500:t=q:w=1.1:g=4'),
            ('ロボ声のうなり（30Hz 微小ビブラート）', 'vibrato=f=30:d=0.07'),
            ('金属コーム（6ms / 11ms 反射）', 'aecho=0.85:0.6:6|11:0.28|0.18'),
            ('ビットクラッシュ 10bit / mix 25%', 'acrusher=bits=10:mode=log:aa=1:mix=0.25'),
        ],
    ),
]


def pitch_formant_filter(pitch: float, formant: float) -> str:
    if math.isclose(pitch, 1.0) and math.isclose(formant, 1.0):
        return ''
    return f'asetrate={SOURCE_RATE * formant:.0f},aresample={SOURCE_RATE},rubberband=tempo={1 / formant:.5f}:pitch={pitch / formant:.5f}:formant=preserved'


def semitones(factor: float) -> str:
    return f'{12 * math.log2(factor):+.1f} 半音'


def main() -> None:
    version = ensure_engine()
    styles = {(name, style): sid for name, style, sid in list_styles()}
    ffmpeg = find_ffmpeg()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    print(f'VOICEVOX {version}   セリフ（{LINE.name}）：「{LINE.text}」\n')

    for take in TAKES:
        sid = styles.get((take.speaker, take.style))
        if sid is None:
            sys.exit(f'Speaker {take.speaker}/{take.style} not found in this engine.')
        raw = RAW_DIR / f'sample_{take.name}.wav'
        out = OUT_DIR / f'sample_{take.name}.wav'
        raw.write_bytes(synthesize(LINE.tts or LINE.text, sid, take.voicevox))

        shift = pitch_formant_filter(take.pitch, take.formant)
        chain = ','.join(filter(None, [shift, *(f for _, f in take.fx), *(f for _, f in FINISH), 'aresample=48000']))
        subprocess.run(
            [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(raw), '-af', chain, '-ac', '2', '-c:a', 'pcm_s16le', str(out)],
            check=True,
        )

        v = take.voicevox
        print(f'■ パターン{take.name}  {out.relative_to(ROOT)}  ({wav_seconds(out):.2f}s)')
        print(f'  狙い     : {take.concept}')
        print(f'  話者     : {take.speaker}/{take.style} (id {sid})  → クレジット「VOICEVOX:{take.speaker}」')
        print(f'  VOICEVOX : 話速 {v["speedScale"]} / ピッチ {v["pitchScale"]:+} / 抑揚 {v["intonationScale"]}')
        print(f'  後処理   : ピッチ {semitones(take.pitch)} / フォルマント ×{take.formant}' + ('' if shift else '（変更なし）'))
        for label, _ in take.fx + FINISH:
            print(f'             - {label}')
        print()

    print(f'Saved to {OUT_DIR}')


if __name__ == '__main__':
    main()

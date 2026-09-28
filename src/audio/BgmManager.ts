/**
 * Background music: one looping track per scene, streamed with HTMLAudioElement (the files are
 * minutes long, so no full decode into memory). Shares the mute switch with SoundManager.
 */
import { sound } from './SoundManager';

export type BgmScene = 'title' | 'game';

/**
 * Files live in public/audio/bgm (served as-is). `title` is the original track name; `artist` is filled
 * in only where the file's own ID3 tags name the composer — the rest still need confirming for credits.
 */
export interface BgmTrack {
  file: string;
  title: string;
  artist?: string;
}

export const BGM_TRACKS: Record<BgmScene, BgmTrack[]> = {
  title: [
    { file: 'title-1-funky-droll-street.mp3', title: 'Funky droll street', artist: 'Kamaboko Sachiko' },
    { file: 'title-2-lets-be-happy.mp3', title: 'Let’s be happy' },
    { file: 'title-3-cube-sky.mp3', title: 'キューブスカイ' },
  ],
  game: [
    { file: 'game-1-jailbreak.mp3', title: 'Jailbreak', artist: 'G-MIYA' },
    { file: 'game-2-ah-mou-mechakucha.mp3', title: 'あーもうめちゃくちゃ！' },
    { file: 'game-3-ultra-oosouji.mp3', title: 'ウルトラ大掃除' },
    { file: 'game-4-time-attack.mp3', title: 'ターイムアタッーク！' },
  ],
};

/** Where the BGM comes from, for the credits screen. */
export const BGM_SOURCE = { name: 'DOVA-SYNDROME', url: 'https://dova-s.jp/' };

/** Default level: quiet enough that SFX (answers, countdown) stay clear on top. */
export const DEFAULT_BGM_VOLUME = 0.35;
/**
 * Output level at slider 100%. The mastered tracks are loud next to the synth SFX, so the whole
 * slider range is scaled down: the default 35% plays at ~16% element volume.
 */
const BGM_BASE_GAIN = 0.45;
const VOLUME_KEY = 'adb.bgmVolume';
const FADE_MS = 600;

function readVolume(): number {
  try {
    const v = Number(localStorage.getItem(VOLUME_KEY));
    return localStorage.getItem(VOLUME_KEY) !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : DEFAULT_BGM_VOLUME;
  } catch {
    return DEFAULT_BGM_VOLUME;
  }
}

class BgmManager {
  private scene: BgmScene | null = null;
  private audio: HTMLAudioElement | null = null;
  private lastFile: Partial<Record<BgmScene, string>> = {};
  private fadeTimer = 0;
  private fading = false;
  private _volume = readVolume();
  private volumeListeners = new Set<() => void>();
  /** Last mute state seen, so SE-volume notifications (same channel) don't restart the BGM. */
  private wasMuted = sound.muted;

  constructor() {
    sound.onMuteChange(() => this.applyMute());
  }

  /** Switch scenes. Re-requesting the current scene keeps the track playing (no restart). */
  setScene(scene: BgmScene | null) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.fadeOut(this.audio);
    this.audio = null;
    if (!scene) return;

    const pool = BGM_TRACKS[scene];
    // Random track, avoiding the one this scene played last time.
    const choices = pool.length > 1 ? pool.filter((t) => t.file !== this.lastFile[scene]) : pool;
    const track = choices[Math.floor(Math.random() * choices.length)];
    this.lastFile[scene] = track.file;

    const audio = new Audio(`./audio/bgm/${track.file}`);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.audio = audio;
    this.play();
  }

  /** BGM level 0–1, persisted across sessions. Applies to the playing track immediately. */
  get volume() {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = Math.min(1, Math.max(0, value));
    try {
      localStorage.setItem(VOLUME_KEY, String(this._volume));
    } catch {
      /* storage unavailable */
    }
    if (this.audio && !this.fading) this.audio.volume = this.outputVolume;
    this.volumeListeners.forEach((fn) => fn());
  }

  /** Element volume actually played: the slider level times the base gain. */
  private get outputVolume() {
    return this._volume * BGM_BASE_GAIN;
  }

  onVolumeChange(fn: () => void): () => void {
    this.volumeListeners.add(fn);
    return () => {
      this.volumeListeners.delete(fn);
    };
  }

  /** Call from a user gesture: browsers refuse to start audio before one. */
  unlock() {
    if (this.audio?.paused) this.play();
  }

  get current(): { scene: BgmScene | null; file: string | null; playing: boolean; volume: number } {
    const a = this.audio;
    return { scene: this.scene, file: a ? a.src.split('/').pop() ?? null : null, playing: !!a && !a.paused, volume: a?.volume ?? 0 };
  }

  private play() {
    const audio = this.audio;
    if (!audio || sound.muted) return;
    audio.play().then(
      () => this.fadeIn(audio),
      () => {
        /* autoplay blocked: unlock() retries on the first gesture */
      },
    );
  }

  private applyMute() {
    if (sound.muted === this.wasMuted) return;
    this.wasMuted = sound.muted;
    if (!this.audio) return;
    if (sound.muted) {
      this.audio.pause();
    } else {
      this.play();
    }
  }

  private fadeIn(audio: HTMLAudioElement) {
    window.clearInterval(this.fadeTimer);
    this.fading = true;
    const start = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / FADE_MS);
      if (audio === this.audio) audio.volume = this.outputVolume * k;
      if (k >= 1 || audio !== this.audio) {
        window.clearInterval(this.fadeTimer);
        this.fading = false;
      }
    }, 30);
  }

  private fadeOut(audio: HTMLAudioElement | null) {
    if (!audio) return;
    const from = audio.volume;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / FADE_MS);
      audio.volume = from * (1 - k);
      if (k >= 1) {
        window.clearInterval(timer);
        audio.pause();
        // Release the stream (an empty src would log a media error instead).
        audio.removeAttribute('src');
        audio.load();
      }
    }, 30);
  }
}

export const bgm = new BgmManager();

if (import.meta.env.DEV) {
  // Handle for manual testing and e2e checks.
  (window as unknown as { __bgm?: BgmManager }).__bgm = bgm;
}


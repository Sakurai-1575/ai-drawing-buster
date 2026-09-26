/**
 * Procedural sound effects using raw Web Audio oscillators — no audio files.
 * The AudioContext is created lazily on the first user gesture (browser autoplay policy).
 */

type Wave = OscillatorType;

const MUTE_KEY = 'adb.muted';
const SE_VOLUME_KEY = 'adb.seVolume';
/** Master gain at SE volume 100% (the synth voices are loud; this is the level they were tuned at). */
const SE_BASE_GAIN = 0.3;

class SoundManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private _muted = readMuted();
  private muteListeners = new Set<() => void>();
  private _seVolume = readSeVolume();

  get muted() {
    return this._muted;
  }

  set muted(value: boolean) {
    const changed = value !== this._muted;
    this._muted = value;
    if (changed) this.muteListeners.forEach((fn) => fn());
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }

  /** Sound-effect level 0–1, persisted. */
  get seVolume() {
    return this._seVolume;
  }

  set seVolume(value: number) {
    this._seVolume = Math.min(1, Math.max(0, value));
    try {
      localStorage.setItem(SE_VOLUME_KEY, String(this._seVolume));
    } catch {
      /* storage unavailable */
    }
    if (this.master) this.master.gain.value = SE_BASE_GAIN * this._seVolume;
    this.muteListeners.forEach((fn) => fn());
  }

  /** The mute switch covers BGM too; BgmManager subscribes here. Also fires on SE volume changes. */
  onMuteChange(fn: () => void): () => void {
    this.muteListeners.add(fn);
    return () => {
      this.muteListeners.delete(fn);
    };
  }

  /** Call from any user gesture handler. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = SE_BASE_GAIN * this._seVolume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(freq: number, at: number, dur: number, type: Wave = 'square', vol = 0.4, endFreq?: number) {
    const { ctx, master } = this;
    if (!ctx || !master || this._muted) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** White-noise burst through a filter — used for cracks, whooshes and impacts. */
  private noise(at: number, dur: number, vol: number, filter: BiquadFilterType, freq: number, endFreq?: number) {
    const { ctx, master } = this;
    if (!ctx || !master || this._muted) return;
    const t0 = ctx.currentTime + at;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bq = ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(freq, t0);
    if (endFreq) bq.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bq).connect(gain).connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Bright two-note arpeggio (A5 → E6), raised 2 semitones per combo step (capped at an octave). */
  correct(combo = 1) {
    const k = 2 ** (Math.min(combo - 1, 6) * 2 / 12);
    this.tone(880 * k, 0, 0.13, 'square', 0.3);
    this.tone(1318.5 * k, 0.09, 0.32, 'square', 0.3);
    this.tone(2637 * k, 0.09, 0.25, 'sine', 0.12);
    if (combo >= 3) this.tone(1760 * k, 0.18, 0.3, 'square', 0.2);
  }

  /** CRITICAL / GOD SPEED: an octave-high sparkling fanfare with a punchy low hit. */
  critical(combo = 1) {
    const k = 2 ** (Math.min(combo - 1, 6) * 2 / 12);
    this.noise(0, 0.25, 0.5, 'highpass', 3000, 9000);
    this.tone(110, 0, 0.3, 'square', 0.35, 55);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => this.tone(f * k, i * 0.055, 0.12, 'square', 0.26));
    [2093, 2637, 3136].forEach((f) => this.tone(f * k, 0.24, 0.6, 'triangle', 0.16));
    [4186, 5274, 6272, 5274, 4186].forEach((f, i) => this.tone(f, 0.26 + i * 0.05, 0.08, 'sine', 0.08));
  }

  /** Short low buzzer. */
  wrong() {
    this.tone(98, 0, 0.38, 'sawtooth', 0.45);
    this.tone(104, 0, 0.38, 'square', 0.22);
  }

  /** Shattering glass: a bright noise crack plus scattered high shards. */
  comboBreak() {
    this.noise(0, 0.35, 0.6, 'highpass', 4000, 1500);
    this.noise(0, 0.08, 0.5, 'bandpass', 2500);
    for (let i = 0; i < 7; i++) {
      const f = 2500 + Math.random() * 4500;
      this.tone(f, 0.02 + i * 0.035 + Math.random() * 0.02, 0.09, 'sine', 0.12, f * 0.8);
    }
  }

  /** "チッ" — a sharp clock tick for the last 3 seconds, with a low heartbeat thump underneath. */
  countdown(secondsLeft: number) {
    const f = secondsLeft <= 1 ? 2400 : 1900;
    this.noise(0, 0.03, 0.55, 'highpass', 5000);
    this.tone(f, 0, 0.035, 'square', 0.3);
    this.tone(70, 0, 0.14, 'sine', 0.7, 45);
    this.tone(62, 0.18, 0.12, 'sine', 0.45, 40);
  }

  /** "ポーン" — the time-up bell. */
  timeUp() {
    this.tone(1046.5, 0, 1.1, 'sine', 0.5);
    this.tone(2093, 0, 0.6, 'sine', 0.18);
    this.tone(523.25, 0, 1.1, 'triangle', 0.3);
  }

  /** Fast-forward whoosh while the rest of the drawing is completed. */
  sweep() {
    this.noise(0, 0.2, 0.35, 'bandpass', 800, 5000);
  }

  /** "バシッ" — the completed drawing slams onto the screen. */
  slam() {
    this.noise(0, 0.12, 0.6, 'lowpass', 2500, 300);
    this.tone(160, 0, 0.22, 'square', 0.4, 50);
  }

  /** Slot-machine counter pip; pitch rises as the roll progresses (0–1). */
  tick(progress = 0) {
    this.tone(1600 + progress * 1400, 0, 0.025, 'square', 0.1);
  }

  gameStart() {
    [523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, i * 0.07, 0.12, 'square', 0.22));
  }

  /** Result fanfare: rising C-major run, then a held chord. */
  fanfare() {
    const run = [523.25, 659.25, 783.99, 1046.5];
    run.forEach((f, i) => this.tone(f, i * 0.12, 0.14, 'square', 0.28));
    const chordAt = run.length * 0.12 + 0.05;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, chordAt, 0.9, 'triangle', 0.22));
    this.tone(130.81, chordAt, 0.9, 'square', 0.15);
  }

  click() {
    this.tone(660, 0, 0.05, 'square', 0.15);
  }
}

function readSeVolume() {
  try {
    const raw = localStorage.getItem(SE_VOLUME_KEY);
    const v = Number(raw);
    return raw !== null && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  } catch {
    return 1;
  }
}

function readMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sound = new SoundManager();

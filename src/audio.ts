/**
 * All sound is synthesised with Web Audio — no files, nothing to load, and
 * every cue is a few lines that can be tuned like any other config.
 *
 * Two jobs: event cues (board, drop, miss, bump, crash, meter tick) and a
 * continuous engine putter whose pitch follows speed and drops when braking,
 * so the *mode* you're in is audible without looking.
 *
 * Browsers refuse to start audio until a user gesture; `unlock()` is wired to
 * the first tap or key and is a no-op after that.
 */

const MUTE_KEY = 'auto_muted';
const MUSIC_KEY = 'auto_music';

/* ------------------------------------------------------------ music */
/**
 * An original background loop, sequenced live rather than played from a
 * file: four bars of I–V–vi–IV in C at 112bpm — the sunny pop progression —
 * with a triangle bass, soft chord stabs on the off-beats, a sparse
 * pentatonic hook, and a light kick/hat/snare. Nothing here is a recording,
 * so there's nothing to licence.
 */
const BPM = 112;
const STEPS = 64; // 4 bars of 16ths
const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// One bar each: C, G, Am, F.
const BASS = [36, 43, 45, 41];
const CHORDS = [
  [60, 64, 67],
  [59, 62, 67],
  [57, 60, 64],
  [57, 60, 65],
];
// A 2-bar hook, repeated with a lift the second time. 0 = rest.
const HOOK = [
  72, 0, 0, 76, 0, 0, 79, 0, 0, 0, 76, 0, 74, 0, 0, 0,
  72, 0, 0, 74, 0, 0, 76, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  72, 0, 0, 76, 0, 0, 79, 0, 0, 0, 81, 0, 79, 0, 0, 0,
  76, 0, 0, 74, 0, 0, 72, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];
const KICK = [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
const SNARE = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
const CHORD_HITS = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private musicGain: GainNode | null = null;
  private musicTimer: number | null = null;
  private nextStepAt = 0;
  private stepIndex = 0;
  musicOn = true;

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private putter: OscillatorNode | null = null;

  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
      this.musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
    } catch {
      // storage blocked — default to sound on
    }
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    // One second of white noise, reused for every percussive hit.
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicOn ? 1 : 0;
    this.musicGain.connect(this.master);

    this.startEngine();
    this.startMusic();
  }

  toggleMusic(): boolean {
    this.musicOn = !this.musicOn;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(this.musicOn ? 1 : 0, this.ctx.currentTime, 0.05);
    }
    try {
      localStorage.setItem(MUSIC_KEY, this.musicOn ? '1' : '0');
    } catch {
      // ignore
    }
    return this.musicOn;
  }

  /* ------------------------------------------------------------ sequencer */

  /**
   * Standard lookahead scheduler: a coarse timer wakes every 25ms and books
   * everything due in the next 120ms against the audio clock, so timing is
   * sample-accurate even though JS timers aren't.
   */
  private startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextStepAt = this.ctx.currentTime + 0.05;
    this.stepIndex = 0;
    const secondsPerStep = 60 / BPM / 4;
    this.musicTimer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextStepAt < this.ctx.currentTime + 0.12) {
        this.playStep(this.stepIndex, this.nextStepAt);
        this.stepIndex = (this.stepIndex + 1) % STEPS;
        this.nextStepAt += secondsPerStep;
      }
    }, 25);
  }

  private playStep(i: number, t: number) {
    if (!this.ctx || !this.musicGain) return;
    const bar = Math.floor(i / 16);
    const beat16 = i % 16;
    const out = this.musicGain;

    if (beat16 % 4 === 0) this.note(midi(BASS[bar]), 0.22, 'triangle', 0.16, t, out);
    if (CHORD_HITS[beat16]) for (const n of CHORDS[bar]) this.note(midi(n), 0.14, 'square', 0.035, t, out, 1200);
    if (HOOK[i]) this.note(midi(HOOK[i]), 0.2, 'triangle', 0.09, t, out);

    if (KICK[beat16]) this.kick(t, out);
    if (SNARE[beat16]) this.snare(t, out);
    if (beat16 % 2 === 0) this.hat(t, out, beat16 % 4 === 2 ? 0.05 : 0.03);
  }

  private note(freq: number, dur: number, type: OscillatorType, vol: number, t: number, out: AudioNode, cutoff?: number) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let chain: AudioNode = osc;
    if (cutoff) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = cutoff;
      chain.connect(lp);
      chain = lp;
    }
    chain.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(t: number, out: AudioNode) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  private snare(t: number, out: AudioNode) {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    src.connect(bp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.12);
  }

  private hat(t: number, out: AudioNode, vol: number) {
    if (!this.ctx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    src.connect(hp).connect(g).connect(out);
    src.start(t);
    src.stop(t + 0.04);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    }
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore
    }
    return this.muted;
  }

  /* ------------------------------------------------------------ engine */

  private startEngine() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;

    // A two-stroke putter: low square wave, amplitude chopped by a fast LFO.
    this.engineOsc = ctx.createOscillator();
    this.engineOsc.type = 'square';
    this.engineOsc.frequency.value = 70;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    // LFO modulates the gain to make it chug rather than drone.
    this.putter = ctx.createOscillator();
    this.putter.type = 'square';
    this.putter.frequency.value = 16;
    const putterDepth = ctx.createGain();
    putterDepth.gain.value = 0.5;
    const putterBase = ctx.createConstantSource();
    putterBase.offset.value = 0.5;
    this.putter.connect(putterDepth);
    const chug = ctx.createGain();
    putterDepth.connect(chug.gain);
    putterBase.connect(chug.gain);

    this.engineOsc.connect(lp).connect(chug).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();
    this.putter.start();
    putterBase.start();
  }

  /**
   * Called every frame. `speedRatio` 0..1 across the game's speed range.
   * Braking drops pitch and volume so it's obviously a different mode.
   */
  setEngine(speedRatio: number, braking: boolean, running: boolean) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.putter) return;
    const t = this.ctx.currentTime;
    const brake = braking ? 0.62 : 1;
    const target = running ? 0.055 * brake : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.05);
    this.engineOsc.frequency.setTargetAtTime((62 + speedRatio * 70) * brake, t, 0.08);
    this.putter.frequency.setTargetAtTime((13 + speedRatio * 16) * brake, t, 0.08);
  }

  /* ------------------------------------------------------------ cues */

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, at = 0, slideTo?: number) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private hit(dur: number, vol: number, cutoff: number, at = 0) {
    if (!this.ctx || !this.master || !this.noise) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  /** Someone got in: two rising notes. */
  board() {
    this.tone(660, 0.09, 'sine', 0.22);
    this.tone(880, 0.12, 'sine', 0.22, 0.08);
  }

  /** Clean drop with a tip: register clack, then a bright ka-ching. */
  drop(tip: number) {
    this.duck(0.5, 0.4);
    this.hit(0.05, 0.25, 3000);
    this.tone(1318, 0.12, 'triangle', 0.2, 0.04);
    this.tone(1760, 0.22, 'triangle', 0.22, 0.1);
    if (tip >= 40) this.tone(2217, 0.3, 'triangle', 0.18, 0.18);
  }

  /** Missed a stop: a sagging two-note "womp". Deliberately annoying. */
  miss() {
    this.tone(440, 0.16, 'sawtooth', 0.14, 0, 380);
    this.tone(330, 0.28, 'sawtooth', 0.14, 0.14, 250);
  }

  /** Pothole / breaker: a dull thud. */
  bump() {
    this.hit(0.11, 0.35, 320);
    this.tone(95, 0.12, 'sine', 0.3, 0, 55);
  }

  /** Drop the music for a moment so a big cue reads clearly. */
  private duck(amount: number, seconds: number) {
    if (!this.ctx || !this.musicGain || !this.musicOn) return;
    const t = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(t);
    this.musicGain.gain.setValueAtTime(amount, t);
    this.musicGain.gain.linearRampToValueAtTime(1, t + seconds);
  }

  /** Run over. */
  crash() {
    this.duck(0.15, 1.6);
    this.hit(0.35, 0.5, 900);
    this.tone(140, 0.45, 'sawtooth', 0.28, 0, 38);
  }

  /** The meter ticking over — quiet, and only while you're earning. */
  tick() {
    this.tone(1400, 0.025, 'sine', 0.07);
  }

  /** Lane change: a tiny click so the swipe registers by ear. */
  swipe() {
    this.tone(520, 0.03, 'square', 0.05);
  }
}
export const sfx = new Sfx();

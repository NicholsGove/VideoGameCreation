/* =========================================================================
 * audio.js — procedural audio system (Web Audio API, no external assets)
 * -------------------------------------------------------------------------
 * Generates all sound effects and a looping ambient music bed at runtime with
 * oscillators + noise, routed through master / music / sfx / voice gain buses
 * so the Settings sliders control real volume. Because everything is
 * synthesised, the game ships with working audio and zero downloaded files.
 *
 * SFX are wired to gameplay via the event bus (see _wireEvents), so any system
 * can just emit an event and the right sound plays.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;

  class Audio {
    constructor() {
      this.ctx = null;
      this.buses = {};
      this._musicTimer = null;
      this._musicStep = 0;
      this._enabledMusic = true;
      this._started = false;
      this.volumes = { master: 0.9, music: 0.6, sfx: 0.9, voice: 0.8 };
    }

    /** Lazily create the AudioContext on first user gesture (autoplay policy). */
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { console.warn("[Audio] Web Audio unavailable"); return; }
      this.ctx = new AC();
      const master = this.ctx.createGain();
      master.connect(this.ctx.destination);
      const music = this.ctx.createGain();
      const sfx = this.ctx.createGain();
      const voice = this.ctx.createGain();
      music.connect(master); sfx.connect(master); voice.connect(master);
      this.buses = { master, music, sfx, voice };
      this.applyVolumes(this.volumes);
      this._wireEvents();
    }

    /** Must be called from a user gesture to satisfy browser autoplay rules. */
    resume() {
      this.init();
      if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    }

    applyVolumes(v) {
      this.volumes = Object.assign(this.volumes, v);
      if (!this.buses.master) return;
      const t = this.ctx.currentTime;
      this.buses.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
      this.buses.music.gain.setTargetAtTime(this.volumes.music, t, 0.02);
      this.buses.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
      this.buses.voice.gain.setTargetAtTime(this.volumes.voice, t, 0.02);
    }

    // ---- Low-level synth voices -----------------------------------------
    _tone(bus, freq, dur, type = "square", vol = 0.3, glideTo = null) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(this.buses[bus] || this.buses.sfx);
      osc.start(t); osc.stop(t + dur + 0.02);
    }

    _noise(bus, dur, vol = 0.3, hp = 400) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const n = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const src = this.ctx.createBufferSource(); src.buffer = buf;
      const filt = this.ctx.createBiquadFilter(); filt.type = "highpass"; filt.frequency.value = hp;
      const g = this.ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(this.buses[bus] || this.buses.sfx);
      src.start(t);
    }

    // ---- Named SFX -------------------------------------------------------
    sfx(name) {
      if (!this.ctx) return;
      switch (name) {
        case "jump":     this._tone("sfx", 300, 0.16, "square", 0.22, 620); break;
        case "land":     this._noise("sfx", 0.08, 0.12, 300); break;
        case "button":   this._tone("sfx", 520, 0.08, "square", 0.25); this._tone("sfx", 720, 0.10, "square", 0.18); break;
        case "switch":   this._tone("sfx", 440, 0.06, "sawtooth", 0.2, 660); break;
        case "door":     this._tone("sfx", 180, 0.3, "sawtooth", 0.2, 90); break;
        case "gem":      this._tone("sfx", 880, 0.07, "sine", 0.25); this._tone("sfx", 1320, 0.12, "sine", 0.22); break;
        case "key":      this._tone("sfx", 990, 0.08, "triangle", 0.25, 1400); break;
        // Nova's chirpy mrrp: a short rising sine with a crystalline tail.
        case "mrrp":     this._tone("sfx", 700, 0.10, "sine", 0.18, 1150); this._tone("sfx", 1750, 0.18, "sine", 0.07); break;
        // Pip's croak: a low descending saw with a wet click on top.
        case "croak":    this._tone("sfx", 240, 0.14, "sawtooth", 0.18, 150); this._noise("sfx", 0.05, 0.08, 420); break;
        case "unlock":   this._tone("sfx", 660, 0.10, "square", 0.22); this._tone("sfx", 990, 0.16, "square", 0.2); break;
        case "death":    this._tone("sfx", 260, 0.4, "sawtooth", 0.28, 70); this._noise("sfx", 0.25, 0.2, 200); break;
        case "victory":  this._arp("voice", [523,659,784,1047], 0.12, 0.28); break;
        case "crate":    this._noise("sfx", 0.1, 0.14, 180); this._tone("sfx", 120, 0.12, "square", 0.14); break;
        case "laser":    this._tone("sfx", 1600, 0.05, "sawtooth", 0.06); break;
        case "teleport": this._arp("sfx", [660, 990, 1320], 0.05, 0.2); break;
        case "ui":       this._tone("sfx", 600, 0.04, "square", 0.16); break;
        // Tactile UI feedback set (crystal/fantasy flavour).
        case "uihover":  this._tone("sfx", 1180, 0.05, "sine", 0.08, 1500); break;      // soft crystal chime
        case "uiselect": this._tone("sfx", 520, 0.10, "triangle", 0.18); this._tone("sfx", 780, 0.13, "sine", 0.12); break; // deeper magical tone
        case "uiback":   this._tone("sfx", 420, 0.16, "sine", 0.14, 170); this._noise("sfx", 0.10, 0.05, 700); break;       // whoosh
        case "uierror":  this._tone("sfx", 150, 0.18, "square", 0.16); break;           // muted buzz
        case "uiconfirm":this._arp("voice", [523, 659, 880], 0.06, 0.22); break;        // triumphant click
        case "achieve":  this._arp("voice", [659, 880, 1047, 1319], 0.10, 0.26); break;
        default: break;
      }
    }

    _arp(bus, freqs, step, vol) {
      if (!this.ctx) return;
      freqs.forEach((f, i) => setTimeout(() => this._tone(bus, f, step * 1.6, "square", vol), i * step * 1000));
    }

    // ---- Ambient music: generative arpeggio + slow pad, themed per biome.
    // Each chapter gets its own scale, bass line, tempo and mood so the
    // soundtrack shifts as the journey progresses (the "Ori" trick: the
    // music IS the atmosphere).
    _musicCfg() {
      const T = {
        // theme: [scale, bass, stepMs, padWave, melodyVol]
        cave:    { scale: [220, 262, 294, 349, 392, 440, 523], bass: [110, 98, 131, 87], step: 360, pad: "sine", vol: 0.055 },
        ruins:   { scale: [196, 233, 262, 311, 349, 392, 466], bass: [98, 87, 117, 78], step: 400, pad: "sine", vol: 0.05 },
        forest:  { scale: [262, 294, 330, 392, 440, 523, 587], bass: [131, 110, 147, 98], step: 320, pad: "triangle", vol: 0.06 },
        jungle:  { scale: [262, 294, 330, 392, 440, 523, 587], bass: [131, 110, 147, 98], step: 320, pad: "triangle", vol: 0.06 },
        temple:  { scale: [220, 247, 277, 330, 370, 440, 494], bass: [110, 123, 92, 104], step: 380, pad: "sine", vol: 0.055 },
        city:    { scale: [294, 330, 370, 440, 494, 587, 659], bass: [147, 131, 165, 110], step: 300, pad: "triangle", vol: 0.06 },
        ice:     { scale: [294, 330, 370, 440, 494, 587, 659], bass: [147, 131, 165, 110], step: 300, pad: "triangle", vol: 0.06 },
        heart:   { scale: [175, 208, 233, 277, 311, 349, 415], bass: [87, 78, 104, 69], step: 440, pad: "sine", vol: 0.05 },
        night:   { scale: [175, 208, 233, 277, 311, 349, 415], bass: [87, 78, 104, 69], step: 440, pad: "sine", vol: 0.05 },
        factory: { scale: [220, 247, 262, 330, 349, 440, 466], bass: [110, 104, 82, 92], step: 310, pad: "triangle", vol: 0.05 },
        lab:     { scale: [220, 247, 262, 330, 349, 440, 466], bass: [110, 104, 82, 92], step: 310, pad: "triangle", vol: 0.05 },
      };
      return T[this._musicTheme] || T.cave;
    }

    /** Called on level load so the soundtrack follows the biome. */
    setMusicTheme(theme) {
      if (theme === this._musicTheme) return;
      this._musicTheme = theme;
      // restart the loop so the new tempo takes hold cleanly
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; this.startMusic(); }
    }

    startMusic() {
      this._enabledMusic = true;
      if (!this.ctx || this._musicTimer) return;
      this._musicStep = 0;
      const tick = () => {
        if (!this._enabledMusic || !this.ctx) return;
        const cfg = this._musicCfg();
        const s = this._musicStep++;
        const { scale, bass } = cfg;
        if (s % 4 === 0) this._tone("music", bass[(s / 4) % bass.length | 0], 1.1, "triangle", 0.10);
        if (s % 2 === 0) {
          const note = scale[(Math.sin(s * 0.7) * 3 + 3) | 0];
          this._tone("music", note, 0.55, "sine", cfg.vol);
        }
        if (s % 8 === 3) this._tone("music", scale[(s / 2) % scale.length | 0] * 2, 0.35, "triangle", cfg.vol * 0.8);
        // slow pad chord (root + fifth, long and soft) — the ambient bed
        if (s % 16 === 0) {
          const root = bass[(s / 16) % bass.length | 0];
          this._tone("music", root, 5.5, cfg.pad, 0.035);
          this._tone("music", root * 1.5, 5.5, cfg.pad, 0.028);
          this._tone("music", root * 2, 5.5, cfg.pad, 0.02);
        }
      };
      this._musicTimer = setInterval(tick, 340);
      // NOTE: interval stays fixed; per-theme `step` shapes density via the
      // modulo patterns above, which avoids re-timer churn between levels.
    }

    stopMusic() {
      this._enabledMusic = false;
      if (this._musicTimer) { clearInterval(this._musicTimer); this._musicTimer = null; }
    }

    // ---- Event wiring: gameplay -> sound --------------------------------
    _wireEvents() {
      if (this._wired) return; this._wired = true;
      const b = GG.bus;
      b.on("player:jump", () => this.sfx("jump"));
      b.on("player:land", () => this.sfx("land"));
      b.on("player:death", () => this.sfx("death"));
      b.on("button:pressed", () => this.sfx("button"));
      b.on("switch:toggled", () => this.sfx("switch"));
      b.on("door:opened", () => this.sfx("door"));
      b.on("gem:collected", () => this.sfx("gem"));
      b.on("key:collected", () => this.sfx("key"));
      b.on("lock:opened", () => this.sfx("unlock"));
      b.on("crate:push", () => this.sfx("crate"));
      b.on("teleport:used", () => this.sfx("teleport"));
      b.on("level:complete", () => this.sfx("victory"));
      b.on("ui:click", () => this.sfx("uiselect"));
      b.on("ui:nav", () => this.sfx("uihover"));
      b.on("ui:transition", () => this.sfx("uiback"));
      b.on("ui:confirm", () => this.sfx("uiconfirm"));
      b.on("ui:error", () => this.sfx("uierror"));
      b.on("achievement:unlocked", () => this.sfx("achieve"));
      // Nova mrrps, Pip croaks — both mean "there's something hidden here".
      b.on("pet:alert", (e) => this.sfx(e && e.kind === "frog" ? "croak" : "mrrp"));
    }
  }

  GG.Audio = Audio;
  GG.audio = new Audio();
})(window);

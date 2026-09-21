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
        // ---- movement & powers: each has its own voice
        case "dash":     this._noise("sfx", 0.18, 0.16, 1200); this._tone("sfx", 520, 0.14, "sine", 0.12, 1100); break;
        case "walljump": this._tone("sfx", 360, 0.08, "square", 0.14, 540); this._noise("sfx", 0.05, 0.08, 900); break;
        case "release":  this._tone("sfx", 440, 0.2, "sine", 0.14, 880); break;
        case "toss":     this._tone("sfx", 180, 0.12, "triangle", 0.2, 360); this._tone("sfx", 540, 0.2, "sine", 0.12, 1080); break;
        case "catch":    this._tone("sfx", 300, 0.06, "square", 0.14); this._tone("sfx", 450, 0.1, "triangle", 0.12); break;
        case "ledge":    this._tone("sfx", 250, 0.05, "square", 0.1, 330); break;
        case "thud":     this._tone("sfx", 70, 0.22, "sine", 0.3, 40); this._noise("sfx", 0.14, 0.2, 120); break;
        case "bounce":   this._tone("sfx", 200, 0.25, "sine", 0.24, 700); break;
        case "swim":     this._noise("sfx", 0.12, 0.06, 600); this._tone("sfx", 300, 0.1, "sine", 0.05, 200); break;
        case "splash":   this._noise("sfx", 0.3, 0.16, 500); break;
        case "mirror":   this._tone("sfx", 1480, 0.12, "sine", 0.12); this._tone("sfx", 2220, 0.2, "sine", 0.06); break;
        case "highfive": this._noise("sfx", 0.05, 0.25, 1600); this._arp("voice", [659, 988, 1319], 0.06, 0.18); break;
        case "grapple":  this._tone("sfx", 800, 0.15, "sawtooth", 0.08, 300); break;
        case "tele":     this._tone("sfx", 330, 0.5, "sine", 0.1, 660); this._tone("sfx", 495, 0.5, "sine", 0.06, 990); break;
        case "hook":     this._tone("sfx", 1200, 0.06, "triangle", 0.12, 700); break;
        case "strike":   this._noise("sfx", 0.08, 0.12, 2200); this._tone("sfx", 520, 0.06, "triangle", 0.08, 300); break;
        case "strikehit":this._tone("sfx", 160, 0.08, "square", 0.16, 90); this._noise("sfx", 0.06, 0.14, 700); break;
        case "roll":     this._noise("sfx", 0.18, 0.08, 500); break;
        case "hurt":     this._tone("sfx", 420, 0.16, "sawtooth", 0.18, 180); this._noise("sfx", 0.1, 0.1, 900); break;
        case "combo":    this._arp("sfx", [784, 988, 1319], 0.05, 0.16); break;
        case "upgrade":  this._arp("voice", [523, 659, 784, 1047, 1319], 0.09, 0.22); break;
        case "bossroar": this._tone("sfx", 90, 0.9, "sawtooth", 0.3, 45); this._noise("sfx", 0.7, 0.2, 150); break;
        case "bossslam": this._tone("sfx", 55, 0.5, "sine", 0.4, 30); this._noise("sfx", 0.35, 0.25, 90); break;
        case "bosswarn": this._tone("sfx", 880, 0.1, "square", 0.08); this._tone("sfx", 660, 0.1, "square", 0.08); break;
        case "bossbeam": this._tone("sfx", 220, 0.6, "sawtooth", 0.14, 440); break;
        case "bossdown": this._tone("sfx", 300, 1.2, "sawtooth", 0.24, 40); setTimeout(() => this._arp("voice", [523, 659, 784, 1047], 0.12, 0.26), 700); break;
        case "escape":   this._tone("sfx", 70, 1.4, "sawtooth", 0.3, 50); this._noise("sfx", 1.2, 0.2, 120); break;
        case "talk":     this._arp("sfx", [440, 554, 494], 0.05, 0.08); break;
        case "coins":    this._arp("sfx", [988, 1319, 1568], 0.05, 0.14); break;
        case "thief":    this._tone("sfx", 660, 0.2, "triangle", 0.1, 990); this._tone("sfx", 330, 0.3, "sine", 0.06, 220); break;
        case "shoot":    this._tone("sfx", 900, 0.06, "square", 0.06, 500); break;
        case "achieve":  this._arp("voice", [659, 880, 1047, 1319], 0.10, 0.26); break;
        default: break;
      }
    }

    /** A footstep, voiced by the ground underfoot (and who's walking). */
    step(surface, heavy) {
      if (!this.ctx) return;
      const v = heavy ? 1.3 : 0.8, now = this.ctx.currentTime;
      if (this._lastStep && now - this._lastStep < 0.06) return;
      this._lastStep = now;
      switch (surface) {
        case "ice":     this._tone("sfx", 1800, 0.04, "sine", 0.03 * v, 2400); this._noise("sfx", 0.04, 0.03 * v, 3000); break;
        case "forest": case "jungle": this._noise("sfx", 0.07, 0.05 * v, 900); break;          // leaves & grass
        case "ruins":   this._noise("sfx", 0.06, 0.05 * v, 1400); this._tone("sfx", 500, 0.03, "sine", 0.02 * v, 350); break;   // wet stone
        case "factory": case "lab": this._tone("sfx", 220, 0.05, "square", 0.035 * v, 180); this._noise("sfx", 0.03, 0.03 * v, 2000); break;  // metal
        case "temple":  this._tone("sfx", 160, 0.06, "triangle", 0.05 * v, 120); break;       // hollow stone
        case "city":    this._tone("sfx", 420, 0.04, "sine", 0.03 * v, 380); break;           // marble tap
        case "heart":   this._tone("sfx", 90, 0.08, "sine", 0.06 * v, 70); break;             // soft, fleshy
        default:        this._noise("sfx", 0.05, 0.05 * v, 500); break;                        // gravel
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
      // gameplay takes over from the title / story score
      if (GG.score && GG.score.playing) GG.score.stop(1.2);
      this._enabledMusic = true;
      if (!this.ctx || this._musicTimer) return;
      this._musicStep = 0; this._combatMix = 0;
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
        // COMBAT LAYER: when beasts are near, a driving pulse and a low
        // ostinato fade in over the bed, and fade back out when it's calm
        this._combatMix += ((this._combat || 0) - this._combatMix) * 0.25;
        const cm = this._combatMix;
        if (cm > 0.05) {
          if (s % 2 === 0) this._noise("music", 0.09, 0.10 * cm, 90);                      // kick-ish thump
          if (s % 4 === 2) this._noise("music", 0.05, 0.06 * cm, 2400);                    // hat
          this._tone("music", bass[(s >> 1) % bass.length] * (s % 2 ? 2 : 1), 0.18, "sawtooth", 0.045 * cm);
        }
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

    /**
     * Region ambience: a bed of little one-shot sounds that play at random —
     * drips in the caves, lapping water, birdsong, clanking machinery, wind,
     * torch crackle, gulls over the isles, and the Heart's slow thump.
     */
    setAmbience(theme) {
      this._amb = theme || null;
      if (this._ambTimer) { clearTimeout(this._ambTimer); this._ambTimer = null; }
      if (!theme || !this.ctx) return;
      const next = () => {
        if (!this._amb || !this.ctx) return;
        this._ambOne(this._amb);
        this._ambTimer = setTimeout(next, 700 + Math.random() * 2200);
      };
      this._ambTimer = setTimeout(next, 900);
    }
    _ambOne(theme) {
      const r = Math.random, v = 0.5;
      switch (theme) {
        case "cave":    this._tone("music", 1400 + r() * 900, 0.18, "sine", 0.03 * v, 700); break;                 // drip
        case "ruins":   this._noise("music", 0.6, 0.03 * v, 300); break;                                          // lapping water
        case "forest": case "jungle": { const f = 1800 + r() * 1400; this._tone("music", f, 0.08, "sine", 0.025 * v, f * 1.3); setTimeout(() => this._tone("music", f * 1.1, 0.07, "sine", 0.02 * v, f * 1.4), 110); break; }  // birds
        case "factory": case "lab": this._tone("music", 90 + r() * 60, 0.12, "square", 0.03 * v, 70); this._noise("music", 0.08, 0.03 * v, 2500); break; // clank
        case "ice":     this._noise("music", 1.4, 0.035 * v, 600); break;                                         // wind
        case "temple":  this._noise("music", 0.25, 0.02 * v, 1800); break;                                        // torch crackle
        case "city":    this._tone("music", 1100 + r() * 300, 0.25, "triangle", 0.02 * v, 900); this._noise("music", 1.0, 0.02 * v, 700); break;   // gulls + breeze
        case "heart":   this._tone("music", 60, 0.2, "sine", 0.08 * v, 45); setTimeout(() => this._tone("music", 55, 0.18, "sine", 0.06 * v, 42), 260); break;  // lub-dub
      }
    }

    /** 0..1: how much danger is near (drives the combat music layer). */
    setCombat(k) { this._combat = Math.max(0, Math.min(1, k || 0)); }

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
      b.on("creature:slain", () => this.sfx("crate"));
      b.on("creature:charge", () => this._tone("sfx", 110, 0.25, "sawtooth", 0.16, 70));
      b.on("creature:screech", () => this._tone("sfx", 1400, 0.12, "square", 0.05, 900));
      b.on("creature:spit", () => this._tone("sfx", 300, 0.08, "sine", 0.12, 520));
      b.on("arena:start", () => this.sfx("door"));
      b.on("arena:clear", () => this.sfx("unlock"));
      b.on("bridge:built", () => this._tone("sfx", 520, 0.12, "triangle", 0.14, 880));
      b.on("map:discovered", () => this._tone("sfx", 1240, 0.08, "sine", 0.07, 1660));
      // movement & powers
      b.on("player:dash", () => this.sfx("dash"));
      b.on("player:walljump", () => this.sfx("walljump"));
      b.on("player:release", () => this.sfx("release"));
      b.on("player:toss", () => this.sfx("toss"));
      b.on("player:catch", () => this.sfx("catch"));
      b.on("player:ledge", () => this.sfx("ledge"));
      b.on("player:thud", () => this.sfx("thud"));
      b.on("player:bounce", () => this.sfx("bounce"));
      b.on("player:swim", () => this.sfx("swim"));
      b.on("water:splash", () => this.sfx("splash"));
      b.on("mirror:turn", () => this.sfx("mirror"));
      b.on("player:highfive", () => this.sfx("highfive"));
      b.on("player:grapple", () => this.sfx("grapple"));
      b.on("player:tele", () => this.sfx("tele"));
      b.on("player:hook", () => this.sfx("hook"));
      b.on("player:shoot", () => this.sfx("shoot"));
      // combat, guardians, escapes and friends
      b.on("player:melee", () => this.sfx("strike"));
      b.on("player:strikehit", () => this.sfx("strikehit"));
      b.on("player:roll", () => this.sfx("roll"));
      b.on("player:hurt", () => this.sfx("hurt"));
      b.on("combo:finisher", () => this.sfx("combo"));
      b.on("upgrade:found", () => this.sfx("upgrade"));
      b.on("boss:start", () => this.sfx("bossroar"));
      b.on("boss:slam", () => this.sfx("bossslam"));
      b.on("boss:crash", () => this.sfx("bossslam"));
      b.on("boss:rain", () => this.sfx("bosswarn"));
      b.on("boss:beam", () => this.sfx("bossbeam"));
      b.on("boss:summon", () => this.sfx("bossroar"));
      b.on("boss:phase", () => this.sfx("bossroar"));
      b.on("boss:defeated", () => this.sfx("bossdown"));
      b.on("escape:start", () => this.sfx("escape"));
      b.on("npc:talk", () => this.sfx("talk"));
      b.on("shop:bought", () => this.sfx("coins"));
      b.on("thief:seen", () => this.sfx("thief"));
      // footsteps: every surface sounds different
      b.on("player:step", (e) => this.step(e && e.surface, e && e.heavy));
      // Nova mrrps, Pip croaks — both mean "there's something hidden here".
      b.on("pet:alert", (e) => this.sfx(e && e.kind === "frog" ? "croak" : "mrrp"));
    }
  }

  GG.Audio = Audio;
  GG.audio = new Audio();
})(window);

/* =========================================================================
 * score.js — the composed soundtrack for the title, the intro and the story
 * -------------------------------------------------------------------------
 * A small orchestra built from Web Audio oscillators and noise (no files):
 *   piano · strings · choir · harp/bells · bass · timpani · whooshes, risers,
 *   heartbeats and shatters — all routed through a generated hall reverb.
 *
 * Music is scheduled a little ahead of time on the audio clock so it stays in
 * perfect time even when the game frame rate wobbles.
 *
 *   GG.score.play("title")          the main theme (D minor, 70 bpm)
 *   GG.score.play("story", "hope")  a mood bed under the story panels
 *   GG.score.cue("heartbeat")       one-shot cinematic sounds
 *   GG.score.stop()                 fade out
 *
 * Everything plays on the MUSIC bus (cues on the SFX bus) so the Settings
 * sliders control it.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---- The main theme ------------------------------------------------- */
  // chord tones (strings / choir), bass roots, per bar
  const CH = {
    Dm: [50, 53, 57], Bb: [50, 53, 58], F: [53, 57, 60], C: [52, 55, 60], Gm: [50, 55, 58], A: [49, 52, 57],
    Am: [48, 52, 57], G: [50, 55, 59], Em: [52, 55, 59], D: [50, 54, 57], E: [52, 56, 59],
  };
  const ROOT = { Dm: 38, Bb: 34, F: 41, C: 36, Gm: 43, A: 45, Am: 45, G: 43, Em: 40, D: 38, E: 40 };
  const THEME_A = ["Dm", "Bb", "F", "C", "Gm", "Bb", "Dm", "A"];
  // melody: [midi, steps] — 8 steps (eighth notes) per bar
  const MELODY = [
    [[69, 4], [74, 2], [76, 2]], [[77, 6], [74, 2]], [[72, 3], [69, 1], [72, 2], [77, 2]], [[76, 6], [67, 2]],
    [[74, 4], [70, 2], [74, 2]], [[77, 4], [76, 2], [74, 2]], [[81, 6], [77, 2]], [[76, 4], [73, 2], [69, 2]],
    [[69, 4], [74, 2], [76, 2]], [[77, 6], [79, 2]], [[81, 3], [79, 1], [77, 2], [76, 2]], [[76, 6], [72, 2]],
    [[74, 4], [77, 2], [79, 2]], [[81, 4], [79, 2], [77, 2]], [[76, 4], [73, 2], [76, 2]], [[74, 8]],
  ];

  /* ---- Story moods: tempo, chords, and which instruments play ---------- */
  const MOODS = {
    mystery: { bpm: 52, bars: ["Dm", "Dm", "Bb", "A"], strings: 0.05, arp: 0, bells: 0.05, drone: 0.05, choir: 0.03 },
    sorrow:  { bpm: 56, bars: ["Am", "F", "C", "G"], strings: 0.06, arp: 0.03, bells: 0, drone: 0.03, choir: 0, sparsePiano: 0.06 },
    wonder:  { bpm: 66, bars: ["F", "C", "Dm", "Bb"], strings: 0.05, arp: 0.045, bells: 0.03, drone: 0, choir: 0.04 },
    tension: { bpm: 84, bars: ["Dm", "Dm", "Bb", "A"], strings: 0.05, arp: 0, bells: 0, drone: 0.06, choir: 0, ostinato: 0.07, timp: 0.25 },
    hope:    { bpm: 70, bars: ["C", "G", "Am", "F"], strings: 0.05, arp: 0.045, bells: 0.035, drone: 0, choir: 0.03 },
    joy:     { bpm: 92, bars: ["G", "D", "Em", "C"], strings: 0.04, arp: 0.05, bells: 0.045, drone: 0, choir: 0.02, shaker: 0.03 },
    triumph: { bpm: 70, bars: THEME_A, strings: 0.06, arp: 0.045, bells: 0, drone: 0, choir: 0.05, melody: 0.09, timp: 0.3 },
  };

  class Score {
    constructor() { this.track = null; this._timer = null; this._noise = null; this._rev = null; this.mood = null; }

    get ctx() { return GG.audio && GG.audio.ctx; }
    _ready() {
      const a = GG.audio; if (!a) return false;
      if (!a.ctx) a.init && a.init();
      if (!a.ctx) return false;
      if (!this._rev) this._buildRig();
      return true;
    }

    /** Hall reverb (generated impulse) + a shared noise buffer. */
    _buildRig() {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * 3.2);
      const ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
      this._rev = ctx.createConvolver(); this._rev.buffer = ir;
      this._revIn = ctx.createGain(); this._revIn.gain.value = 0.55;
      this._revIn.connect(this._rev);
      this._rev.connect(GG.audio.buses.music);
      this._sfxRevIn = ctx.createGain(); this._sfxRevIn.gain.value = 0.5;
      const sfxRev = ctx.createConvolver(); sfxRev.buffer = ir;
      this._sfxRevIn.connect(sfxRev); sfxRev.connect(GG.audio.buses.sfx);
      const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const nd = n.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      this._noise = n;
    }

    /** A voice's output: dry to the bus, some to the reverb. */
    _out(dest, wet) {
      const ctx = this.ctx, g = ctx.createGain();
      dest = dest || (this.track && this.track.gain) || GG.audio.buses.music;
      g.connect(dest);
      if (wet !== 0) {
        const s = ctx.createGain(); s.gain.value = wet == null ? 0.6 : wet;
        g.connect(s); s.connect(dest === GG.audio.buses.sfx ? this._sfxRevIn : this._revIn);
      }
      return g;
    }
    _env(g, t, a, v, hold, rel) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a);
      g.gain.setValueAtTime(Math.max(0.0002, v), t + a + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    }
    _osc(type, f, t, end, dest, detune) {
      const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
      if (detune) o.detune.value = detune;
      o.connect(dest); o.start(t); o.stop(end + 0.05); return o;
    }

    /* ---- instruments -------------------------------------------------- */
    piano(m, t, dur, v, dest) {
      const f = mtof(m), ctx = this.ctx;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2600;
      const g = this._out(dest); lp.connect(g);
      const decay = Math.max(1.2, dur * 1.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      this._osc("triangle", f, t, t + decay, lp);
      const h2 = ctx.createGain(); h2.gain.value = 0.35; h2.connect(lp); this._osc("sine", f * 2, t, t + decay, h2);
      const h3 = ctx.createGain(); h3.gain.value = 0.12; h3.connect(lp); this._osc("sine", f * 3.003, t, t + decay * 0.6, h3);
    }
    strings(ms, t, dur, v, dest) {
      const ctx = this.ctx;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.setValueAtTime(700, t); lp.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
      const g = this._out(dest, 0.8); lp.connect(g);
      this._env(g, t, Math.min(0.9, dur * 0.35), v, Math.max(0.05, dur - 0.9), 1.0);
      for (const m of ms) for (const d of [-8, 0, 7]) this._osc("sawtooth", mtof(m), t, t + dur + 1.1, lp, d);
    }
    choir(ms, t, dur, v, dest) {
      const ctx = this.ctx;
      const g = this._out(dest, 0.9);
      this._env(g, t, Math.min(1.1, dur * 0.4), v, Math.max(0.05, dur - 1.1), 1.2);
      for (const fq of [650, 1080]) {                   // "aah" formants
        const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = fq; bp.Q.value = 4;
        const fg = ctx.createGain(); fg.gain.value = 1.6; bp.connect(fg); fg.connect(g);
        for (const m of ms) {
          const o = this._osc("sawtooth", mtof(m + 12), t, t + dur + 1.3, bp, (Math.random() - 0.5) * 12);
          const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5 + Math.random(); lg.gain.value = 4;
          lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 1.3);
        }
      }
    }
    bell(m, t, v, dest) {
      const f = mtof(m), g = this._out(dest, 0.8);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
      this._osc("sine", f, t, t + 2.8, g);
      const p = this.ctx.createGain(); p.gain.value = 0.3; p.connect(g); this._osc("sine", f * 2.76, t, t + 1.4, p);
      const q = this.ctx.createGain(); q.gain.value = 0.12; q.connect(g); this._osc("sine", f * 5.4, t, t + 0.7, q);
    }
    bass(m, t, dur, v, dest) {
      const g = this._out(dest, 0.2);
      this._env(g, t, 0.02, v, Math.max(0.05, dur - 0.3), 0.5);
      this._osc("sine", mtof(m), t, t + dur + 0.6, g);
      const h = this.ctx.createGain(); h.gain.value = 0.25; h.connect(g); this._osc("triangle", mtof(m + 12), t, t + dur + 0.6, h);
    }
    timpani(t, v, m, dest) {
      const ctx = this.ctx, f = mtof(m || 38);
      const g = this._out(dest, 0.7);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f * 1.4, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
      o.connect(g); o.start(t); o.stop(t + 1.7);
      this._noiseBurst(t, 0.25, v * 0.5, 80, 400, dest);
    }
    _noiseBurst(t, dur, v, f0, f1, dest, bpQ) {
      const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this._noise;
      const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = bpQ || 0.8;
      bp.frequency.setValueAtTime(f0, t); bp.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      const g = this._out(dest, 0.6);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.4, dur * 0.4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(bp); bp.connect(g); src.start(t, Math.random()); src.stop(t + dur + 0.05);
    }

    /* ---- one-shot cinematic cues (SFX bus) ---------------------------- */
    cue(name, when) {
      if (!this._ready()) return;
      const t = (when != null ? when : this.ctx.currentTime) + 0.01, S = GG.audio.buses.sfx;
      switch (name) {
        case "whoosh": this._noiseBurst(t, 1.2, 0.35, 200, 3200, S); break;
        case "whooshDown": this._noiseBurst(t, 1.0, 0.3, 3000, 200, S); break;
        case "riser": this._noiseBurst(t, 1.6, 0.25, 300, 6000, S, 2); { const g = this._out(S, 0.5); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 1.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.7); const o = this.ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(880, t + 1.6); o.connect(g); o.start(t); o.stop(t + 1.8); } break;
        case "heartbeat": for (const [dt, v] of [[0, 0.5], [0.26, 0.35]]) { const g = this._out(S, 0.3); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(v, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.35); const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(70, t + dt); o.frequency.exponentialRampToValueAtTime(42, t + dt + 0.3); o.connect(g); o.start(t + dt); o.stop(t + dt + 0.4); } break;
        case "spark": this.bell(96, t, 0.08, S); this.bell(103, t + 0.12, 0.05, S); break;
        case "shimmer": for (let i = 0; i < 7; i++) this.bell(84 + [0, 3, 7, 10, 12, 15, 19][i], t + i * 0.09, 0.035, S); break;
        case "impact": this.timpani(t, 0.6, 33, S); this._noiseBurst(t, 1.8, 0.25, 900, 60, S); this.bell(62, t, 0.1, S); break;
        case "logo": this.timpani(t, 0.55, 38, S); this.choir([50, 57, 62], t, 2.4, 0.07, S); this.bell(86, t, 0.06, S); this.bell(93, t + 0.1, 0.04, S); break;
        case "shatter": this._noiseBurst(t, 1.4, 0.4, 5000, 400, S); for (let i = 0; i < 9; i++) this.bell(100 - i * 2 - (i % 2) * 5, t + i * 0.05, 0.04, S); this.timpani(t, 0.5, 30, S); break;
        case "rumble": this._noiseBurst(t, 2.4, 0.4, 90, 50, S, 0.5); break;
        case "wind": this._noiseBurst(t, 3, 0.12, 500, 900, S, 0.6); break;
        case "crystal": for (let i = 0; i < 4; i++) this.bell(88 + i * 4, t + i * 0.15, 0.04, S); break;
        case "choir": this.choir([50, 57, 62, 65], t, 3, 0.05, S); break;
        case "chime": this.bell(81, t, 0.08, S); this.bell(88, t + 0.18, 0.06, S); break;
        case "birds": for (let i = 0; i < 5; i++) { const f = 2400 + Math.random() * 1400, g = this._out(S, 0.3), ti = t + i * 0.22 + Math.random() * 0.1; g.gain.setValueAtTime(0.0001, ti); g.gain.exponentialRampToValueAtTime(0.03, ti + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.12); const o = this.ctx.createOscillator(); o.frequency.setValueAtTime(f, ti); o.frequency.exponentialRampToValueAtTime(f * 1.3, ti + 0.1); o.connect(g); o.start(ti); o.stop(ti + 0.15); } break;
        case "fireworks": for (let i = 0; i < 4; i++) { const ti = t + i * 0.5; this._noiseBurst(ti, 0.5, 0.2, 2000, 300, S); for (let k = 0; k < 4; k++) this.bell(90 + k * 3 + i, ti + 0.08 + k * 0.04, 0.02, S); } break;
        case "bells": for (let i = 0; i < 8; i++) this.bell([74, 72, 69, 67, 74, 72, 69, 62][i], t + i * 0.3, 0.07, S); break;
        case "thief": this.bell(75, t, 0.06, S); this.bell(70, t + 0.2, 0.05, S); this._noiseBurst(t, 0.6, 0.15, 3000, 1200, S); break;
        case "magic": this._noiseBurst(t, 1.0, 0.12, 1500, 6000, S, 3); this.bell(91, t + 0.3, 0.05, S); this.bell(98, t + 0.45, 0.04, S); break;
        case "page": this._noiseBurst(t, 0.35, 0.08, 1200, 4000, S, 1); break;
        case "blip": { const g = this._out(S, 0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04); const o = this.ctx.createOscillator(); o.type = "triangle"; o.frequency.value = 900 + Math.random() * 120; o.connect(g); o.start(t); o.stop(t + 0.05); } break;
      }
    }

    /* ---- music playback ------------------------------------------------ */
    /** Start a piece: "title" or "story" (+ mood). Cross-fades from what's playing. */
    play(kind, mood) {
      if (!this._ready()) { this._pending = [kind, mood]; return; }
      const key = kind + ":" + (mood || "");
      if (this.track && this.track.key === key && !this.track.dying) return;
      if (GG.audio && GG.audio.stopMusic) GG.audio.stopMusic(true);   // the game's ambient bed steps aside
      this._fadeOut(1.4);
      const ctx = this.ctx, g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.2);
      g.connect(GG.audio.buses.music);
      const def = kind === "title" ? { bpm: 70, bars: THEME_A, title: true } : (MOODS[mood] || MOODS.wonder);
      this.track = { key, gain: g, def, step: 0, bar: 0, next: ctx.currentTime + 0.15 };
      this.mood = mood || kind;
      if (!this._timer) this._timer = setInterval(() => this._tick(), 60);
    }
    _fadeOut(sec) {
      if (!this.track) return;
      const g = this.track.gain, t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value || 0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + sec);
      setTimeout(() => { try { g.disconnect(); } catch (_) {} }, sec * 1000 + 3000);
      this.track.dying = true; this.track = null;
    }
    stop(sec) { this._fadeOut(sec || 1.5); this._pending = null; }
    get playing() { return !!this.track; }

    _tick() {
      const tr = this.track; if (!tr || !this.ctx) return;
      const stepDur = 60 / tr.def.bpm / 2;                    // eighth notes
      while (tr.next < this.ctx.currentTime + 0.3) {
        try { tr.def.title ? this._titleStep(tr, tr.next, stepDur) : this._moodStep(tr, tr.next, stepDur); } catch (e) { /* never let music crash the game */ }
        tr.next += stepDur; tr.step++;
        if (tr.step % 8 === 0) tr.bar++;
      }
    }

    /** The title theme: 8 bars of intro (harp + strings), then the melody with choir. */
    _titleStep(tr, t, sd) {
      const s = tr.step % 8, bar = tr.bar, out = tr.gain;
      const inTheme = bar >= 8;
      const phrase = inTheme ? (bar - 8) % 16 : bar % 8;
      const chord = THEME_A[phrase % 8], ch = CH[chord], root = ROOT[chord];
      if (s === 0) {
        this.strings(ch, t, sd * 8, inTheme ? 0.045 : 0.035, out);
        this.bass(root, t, sd * 4, 0.12, out);
        if (inTheme && phrase % 4 === 0) this.choir(ch.map(m => m + 12), t, sd * 16, 0.035, out);
        if (phrase === 0) this.timpani(t, inTheme ? 0.35 : 0.22, 38, out);
      }
      if (s === 4) this.bass(root + 7, t, sd * 4, 0.08, out);
      // harp / piano arpeggio
      const pat = [0, 1, 2, 1, 0 + 3, 2, 1, 2];
      const notes = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
      this.piano(notes[pat[s] % 4], t, sd, inTheme ? 0.035 : 0.045, out);
      // melody (bells + piano, doubled an octave up in the second half)
      if (inTheme) {
        const mel = MELODY[phrase % 16];
        let acc = 0;
        for (const [m, len] of mel) {
          if (acc === s) { this.piano(m, t, sd * len, 0.1, out); this.bell(m + 12, t, 0.025, out); if (phrase >= 8) this.strings([m], t, sd * len, 0.02, out); }
          acc += len;
        }
      }
    }

    /** A story mood: pads, harp, bells, drones and pulses. */
    _moodStep(tr, t, sd) {
      const d = tr.def, s = tr.step % 8, bar = tr.bar, out = tr.gain;
      const chord = d.bars[bar % d.bars.length], ch = CH[chord], root = ROOT[chord];
      if (s === 0) {
        if (d.strings) this.strings(ch, t, sd * 8, d.strings, out);
        if (d.choir && bar % 2 === 0) this.choir(ch.map(m => m + 12), t, sd * 16, d.choir, out);
        if (d.drone) this.bass(root, t, sd * 8, d.drone * 2, out);
        else this.bass(root, t, sd * 6, 0.09, out);
        if (d.timp && bar % 2 === 0) this.timpani(t, d.timp, root, out);
      }
      if (d.arp) { const n = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 24][[0, 1, 2, 3, 2, 1, 2, 3][s]]; this.piano(n, t, sd, d.arp, out); }
      if (d.sparsePiano && (s === 0 || s === 5)) this.piano(ch[(bar + s) % 3] + 12, t, sd * 3, d.sparsePiano, out);
      if (d.bells && Math.random() < 0.28) this.bell(ch[(Math.random() * 3) | 0] + 24, t, d.bells, out);
      if (d.ostinato) this.bass(root + (s % 2 ? 12 : 0), t, sd * 0.9, d.ostinato * 1.5, out);
      if (d.shaker && s % 2 === 1) this._noiseBurst(t, 0.08, d.shaker, 6000, 8000, out);
      if (d.melody) {
        const mel = MELODY[bar % 16]; let acc = 0;
        for (const [m, len] of mel) { if (acc === s) { this.piano(m, t, sd * len, d.melody, out); this.bell(m + 12, t, 0.02, out); } acc += len; }
      }
    }
  }

  GG.score = new Score();
})(window);

/* =========================================================================
 * ui.js — DOM-based menus, HUD and overlays
 * -------------------------------------------------------------------------
 * All chrome (menus, settings, HUD, toasts) lives in the DOM overlay so text
 * is crisp and accessible, while gameplay renders on the canvas underneath.
 * The UI only calls into GG.game's public methods — it never touches gameplay
 * internals, keeping presentation and simulation cleanly separated.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG, U = GG.util;

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  const click = (node, sel, fn) => node.querySelectorAll(sel).forEach(n => n.addEventListener("click", (e) => { GG.bus.emit("ui:click"); fn(e, n); }));

  const ui = {
    root: null, menuLayer: null, hudLayer: null, _hud: null,

    init() {
      this.root = document.getElementById("ui");
      const boot = document.getElementById("boot"); if (boot) boot.remove();
      this.menuLayer = el(`<div id="menuLayer" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;"></div>`);
      this.hudLayer = el(`<div id="hudLayer" style="position:absolute;inset:0;pointer-events:none;"></div>`);
      this.root.appendChild(this.hudLayer);
      this.root.appendChild(this.menuLayer);
      // Screen-transition overlay (fade-through-black + rune sparkle).
      this._trans = el(`<div id="transition"><div class="runes">✦ ◆ ✦</div></div>`);
      this.root.appendChild(this._trans);
      this._buildHUD();

      // Keyboard navigation for whichever menu panel is open.
      window.addEventListener("keydown", (e) => {
        if (GG.game.state !== "menu" || !this._navState) return;
        if (!this.menuLayer.querySelector(".menu")) return;
        if (document.activeElement && document.activeElement.tagName === "INPUT") return;
        if (e.code === "ArrowDown" || e.code === "KeyS") { this._navState.move(1); e.preventDefault(); }
        else if (e.code === "ArrowUp" || e.code === "KeyW") { this._navState.move(-1); e.preventDefault(); }
        else if (e.code === "Enter" || e.code === "Space") { this._navState.activate(); e.preventDefault(); }
      });
      // Gamepad menu navigation (polled from the input manager).
      GG.bus.on("pad:menu", (d) => {
        if (GG.game.state !== "menu" || !this._navState || !this.menuLayer.querySelector(".menu")) return;
        if (d === "down") this._navState.move(1);
        else if (d === "up") this._navState.move(-1);
        else if (d === "confirm") this._navState.activate();
      });
    },

    /** Animated screen transition: fade through black, run fn mid-fade, fade back. */
    transition(fn) {
      GG.bus.emit("ui:transition");
      const o = this._trans;
      o.classList.add("show");
      setTimeout(() => { try { if (fn) fn(); } catch (e) { console.error(e); } }, 300);
      setTimeout(() => o.classList.remove("show"), 640);
    },

    /** Brief autosave/loading indicator. */
    savingIndicator(text) {
      const t = el(`<div class="toast"><span class="a-title">💾 ${text || "Saving…"}</span></div>`);
      this.hudLayer.appendChild(t);
      setTimeout(() => t.remove(), 1600);
    },

    // ---- Menu plumbing ---------------------------------------------------
    _set(node) { this.menuLayer.innerHTML = ""; this.menuLayer.appendChild(node); this.menuLayer.style.display = "flex"; },
    hideMenus() { this.menuLayer.innerHTML = ""; this.menuLayer.style.display = "none"; },

    // ---- Main menu -------------------------------------------------------
    showMainMenu() {
      this.hideHUD();
      const cont = GG.save.data.unlockedLevel;
      const hasSave = cont > 1;
      const btn = (a, cls, ico, title, sub) =>
        `<button class="btn ${cls} nav" data-a="${a}"><span class="ico">${ico}</span><span class="label">${title}${sub ? `<span class="sub">${sub}</span>` : ""}</span></button>`;
      const sbtn = (a, cls, ico, title) =>
        `<button class="btn small ${cls} nav" data-a="${a}"><span class="ico">${ico}</span>${title}</button>`;
      const node = el(`
        <div class="menu menu-right">
          <p class="tagline" style="margin-top:2px;">Restore the Heart Engine — together.<br><span class="badge p1">Nichols</span> &amp; <span class="badge p2">Nibihah</span></p>
          ${btn("story", "primary", "▶", "Story Mode", "Play the adventure from the beginning")}
          <button class="btn nav" data-a="continue" ${hasSave ? "" : "disabled"}><span class="ico">⏳</span><span class="label">Continue<span class="sub">${hasSave ? "Resume at Aether Shard " + Math.min(cont, GG.LEVEL_COUNT) : "No save yet"}</span></span></button>
          ${btn("local", "", "👥", "Local Co-op", "WASD + arrows · or two gamepads")}
          ${btn("online", "", "🌐", "Online Co-op", "Host or join with a lobby code")}
          <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap;">
            ${sbtn("levels", "", "🗺", "Levels")}
            ${sbtn("achv", "", "🏆", "Achievements")}
            ${sbtn("settings", "", "⚙", "Settings")}
            ${sbtn("credits", "", "📜", "Credits")}
            ${sbtn("how", "", "❓", "How to Play")}
            ${sbtn("quit", "danger", "🚪", "Quit")}
          </div>
        </div>`);
      click(node, '[data-a="story"]', () => this.showStory());
      click(node, '[data-a="continue"]', () => { if (hasSave) { this.savingIndicator("Save loaded"); this.transition(() => GG.game.startLocal(Math.min(GG.save.data.unlockedLevel, GG.LEVEL_COUNT))); } });
      click(node, '[data-a="local"]', () => this.showLevelSelect("local"));
      click(node, '[data-a="online"]', () => this.showOnline());
      click(node, '[data-a="levels"]', () => this.showLevelSelect("local"));
      click(node, '[data-a="achv"]', () => this.showAchievements());
      click(node, '[data-a="settings"]', () => this.showSettings("main"));
      click(node, '[data-a="credits"]', () => this.showCredits());
      click(node, '[data-a="how"]', () => this.showHowTo());
      click(node, '[data-a="quit"]', () => this.showQuit());
      this._set(node);
      this._bindNav(node);
    },

    /** Keyboard/gamepad navigation + hover sound for a menu panel. */
    _bindNav(node) {
      const items = Array.from(node.querySelectorAll(".nav:not([disabled])"));
      if (!items.length) return;
      let sel = 0;
      const paint = () => items.forEach((b, i) => b.classList.toggle("selected", i === sel));
      paint();
      items.forEach((b, i) => b.addEventListener("mouseenter", () => { if (sel !== i) { sel = i; paint(); GG.bus.emit("ui:nav"); } }));
      this._navState = {
        move: (d) => { sel = (sel + d + items.length) % items.length; paint(); GG.bus.emit("ui:nav"); },
        activate: () => items[sel] && items[sel].click(),
      };
    },

    showStory() {
      const node = el(`
        <div class="menu">
          <h2>Echoes of Aether</h2>
          <p class="credits">
            Long ago the world was powered by the <b>Heart Engine</b>, an ancient machine that
            kept every kingdom, forest and floating island in perfect balance.<br><br>
            One day it fractured into <b>Aether Shards</b>, scattering across forgotten temples,
            sunken ruins, abandoned factories, icy peaks and overgrown jungles. Without it,
            reality began to break — gravity shifted, bridges fell, machines went dark.<br><br>
            Two unlikely explorers — <span class="badge p1">Nichols</span> the inventor and
            <span class="badge p2">Nibihah</span> the acrobat — discover they each hold half of the
            <b>Aether Compass</b>. Only together can they reveal hidden paths and rebuild the Heart.<br><br>
            But someone — or something — does not want the world repaired…
          </p>
          <div class="row back-row" style="gap:8px;">
            <button class="btn primary" data-a="play">Begin</button>
            <button class="btn" data-a="back">Back</button>
          </div>
        </div>`);
      click(node, '[data-a="play"]', () => this.transition(() =>
        GG.game.playCutscene("prologue", () => GG.game.startLocal(1))));
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node); this._bindNav(node);
    },

    showHowTo() {
      const node = el(`
        <div class="menu">
          <h2>How to Play</h2>
          <p class="credits">
            <b>Nichols</b> (green) — immune to <span class="badge p1">electricity</span>, pushes heavy objects, repairs machines, activates GREEN mechanisms.<br>
            <b>Nibihah</b> (blue) — immune to <span class="badge p2">poison</span>, double-jumps, fits through narrow passages, activates BLUE mechanisms.<br><br>
            <b>Cooperative physics:</b> stand on each other's heads, jump off a partner to reach higher ledges, and push one another. Wall-slide down tall walls; drop through one-way platforms by holding <span class="kbd">↓</span>.<br><br>
            Neither hero can finish alone — <b>both</b> must stand on their matching exit pads at once. <b>Gamepads</b> are auto-detected.
          </p>
          <div class="divider"></div>
          <div class="row between"><span>Player 1 (Nichols)</span><span><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> / Pad 1</span></div>
          <div class="row between"><span>Player 2 (Nibihah)</span><span><span class="kbd">▲</span><span class="kbd">◄</span><span class="kbd">▼</span><span class="kbd">►</span> / Pad 2</span></div>
          <div class="row between"><span>Special (grapple/tele · swing/dash)</span><span><span class="kbd">Q</span> · <span class="kbd">R-Shift</span></span></div>
          <div class="row between"><span>Attack (bolt gun · bow)</span><span><span class="kbd">E</span> · <span class="kbd">.</span></span></div>
          <div class="row between"><span>Ping a spot</span><span><span class="kbd">F</span> · <span class="kbd">/</span></span></div>
          <div class="row between"><span>Pause · Restart</span><span><span class="kbd">Esc</span>/Start <span class="kbd">R</span></span></div>
          <div class="back-row"><button class="btn" data-a="back">Back</button></div>
        </div>`);
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node);
    },

    // ---- Level select ----------------------------------------------------
    showLevelSelect(mode, chapterId) {
      const unlocked = GG.save.data.unlockedLevel;
      const chId = chapterId || 1;
      const chap = GG.CHAPTERS.find(c => c.id === chId) || GG.CHAPTERS[0];
      // chapter rail
      const rail = GG.CHAPTERS.map(c =>
        `<div class="tab ${c.id === chId ? "active" : ""} ${c.built ? "" : "locked-tab"}" data-ch="${c.id}">
           <span class="ico">${c.built ? "📖" : "🔒"}</span>${c.id}</div>`).join("");
      const inChapter = GG.LEVELS.filter(l => l.chapter === chId);
      const cards = chap.built
        ? inChapter.map(l => {
            const p = GG.save.getLevel(l.id);
            const locked = l.id > unlocked;
            const best = p && p.completed ? `★ ${U.formatTime(p.bestMs)} · ${p.gems || 0}💎` : "";
            return `<div class="level-card ${locked ? "locked" : ""}" data-id="${l.id}">
              <div class="num">${l.id}</div><div class="nm">${l.name}</div>
              <div class="best">${best}</div></div>`;
          }).join("")
        : `<p class="tagline center" style="grid-column:1/-1;">🔒 Chapter ${chap.id} — <b>${chap.name}</b><br>${chap.blurb}<br><span class="badge warn">Levels ${chap.from}–${chap.to} · in development</span></p>`;
      const vault = GG.VAULT.map(id => {
        const l = GG.LEVELS.find(x => x.id === id);
        return `<div class="level-card" data-id="${id}"><div class="num">✦</div><div class="nm">${l.name}</div></div>`;
      }).join("");
      const node = el(`
        <div class="menu">
          <h2>${chap.built ? chap.name : "Chapters"} <span class="badge">${mode === "online" ? "Online" : "Local 2P"}</span></h2>
          <p class="tagline" style="margin:0 0 10px;">${chap.blurb}</p>
          <div class="tabs">${rail}</div>
          <div class="level-grid">${cards}</div>
          <div class="divider"></div>
          <div class="section-title">✦ Prototype Vault <span class="hint">— bonus rooms</span></div>
          <div class="level-grid">${vault}</div>
          <div class="field" style="margin-top:14px;">
            <label>Swap heroes — P1 plays ${GG.game.charAssign[0] === 0 ? "Nichols" : "Nibihah"}</label>
            <div class="toggle ${GG.game.charAssign[0] === 1 ? "on" : ""}" data-a="swap"><div class="knob"></div></div>
          </div>
          <div class="back-row"><button class="btn" data-a="back">Back</button></div>
        </div>`);
      click(node, ".level-card", (e, n) => {
        const id = +n.dataset.id;
        if (id < 100 && id > unlocked) { GG.bus.emit("ui:error"); this.toast("🔒 Locked", "Finish earlier levels first"); return; }
        this.transition(() => { if (mode === "online") GG.game.startOnline(GG.game.role, id); else GG.game.startLocal(id); });
      });
      node.querySelectorAll("[data-ch]").forEach(t => t.addEventListener("click", () => {
        GG.bus.emit("ui:nav"); this.showLevelSelect(mode, +t.dataset.ch);
      }));
      click(node, '[data-a="swap"]', (e, n) => {
        GG.game.charAssign = GG.game.charAssign[0] === 0 ? [1, 0] : [0, 1];
        n.classList.toggle("on");
      });
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node);
    },

    // ---- Online lobby ----------------------------------------------------
    showOnline() {
      const avail = GG.net.available();
      const node = el(`
        <div class="menu">
          <h2>Online Multiplayer</h2>
          ${avail ? "" : `<p class="tagline" style="color:var(--danger)">Online needs an internet connection — the networking library couldn't load. Local play still works.</p>`}
          <button class="btn primary" data-a="host" ${avail ? "" : "disabled"}>Host a Game <span class="sub">Create a lobby code and share it with a friend</span></button>
          <div class="divider"></div>
          <div class="field"><label>Join with code</label><input type="text" maxlength="5" id="joinCode" placeholder="ABC12"></div>
          <button class="btn" data-a="join" ${avail ? "" : "disabled"}>Join Game</button>
          <div class="back-row"><button class="btn" data-a="back">Back</button></div>
        </div>`);
      click(node, '[data-a="host"]', () => this._doHost());
      click(node, '[data-a="join"]', () => {
        const code = node.querySelector("#joinCode").value.trim().toUpperCase();
        if (code.length < 4) { this.toast("Enter a code", "Ask the host for their 5-letter code"); return; }
        this._doJoin(code);
      });
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node);
    },

    _doHost() {
      GG.game.role = "host";
      const node = el(`
        <div class="menu">
          <h2>Hosting…</h2>
          <p class="tagline">Share this code with your friend. The game starts automatically when they join.</p>
          <div class="lobby-code" id="code">· · · · ·</div>
          <p class="center"><span class="badge warn" id="netmsg">Creating lobby…</span></p>
          <div class="back-row"><button class="btn" data-a="cancel">Cancel</button></div>
        </div>`);
      click(node, '[data-a="cancel"]', () => { GG.net.close(); this.showOnline(); });
      this._set(node);
      GG.net.host().then((code) => {
        const c = node.querySelector("#code"); if (c) c.textContent = code;
        const m = node.querySelector("#netmsg"); if (m) { m.textContent = "Waiting for player 2…"; }
      }).catch((err) => { const m = node.querySelector("#netmsg"); if (m) { m.className = "badge err"; m.textContent = String(err.message || err); } });
      // When the client connects, host boots into the chosen level.
      GG.bus.once("net:connected", () => {
        this.toast("Player joined!", "Starting game");
        GG.game.startOnline("host", 1);
      });
    },

    _doJoin(code) {
      GG.game.role = "client";
      const node = el(`
        <div class="menu">
          <h2>Joining ${code}…</h2>
          <p class="center"><span class="badge warn" id="netmsg">Connecting…</span></p>
          <div class="back-row"><button class="btn" data-a="cancel">Cancel</button></div>
        </div>`);
      click(node, '[data-a="cancel"]', () => { GG.net.close(); this.showOnline(); });
      this._set(node);
      GG.net.join(code).then(() => {
        const m = node.querySelector("#netmsg"); if (m) { m.className = "badge ok"; m.textContent = "Connected! Waiting for host…"; }
      }).catch((err) => { const m = node.querySelector("#netmsg"); if (m) { m.className = "badge err"; m.textContent = String(err.message || err); } });
    },

    // ---- Settings: an ancient control console with icon tabs -------------
    showSettings(from, tab) {
      tab = tab || this._lastTab || "audio";
      const node = el(`
        <div class="menu">
          <h2>⚙ Settings</h2>
          <div class="tabs">
            <div class="tab" data-tab="gameplay"><span class="ico">🎮</span>Gameplay</div>
            <div class="tab" data-tab="audio"><span class="ico">🔊</span>Audio</div>
            <div class="tab" data-tab="graphics"><span class="ico">🖥</span>Graphics</div>
            <div class="tab" data-tab="access"><span class="ico">♿</span>Access</div>
            <div class="tab" data-tab="controls"><span class="ico">⌨</span>Controls</div>
          </div>
          <div class="tab-body" id="tabbody"></div>
          <div class="back-row"><button class="btn nav" data-a="back"><span class="ico">↩</span><span class="label">Back</span></button></div>
        </div>`);
      const body = node.querySelector("#tabbody");
      const showTab = (t) => {
        this._lastTab = t;
        node.querySelectorAll(".tab").forEach(x => x.classList.toggle("active", x.dataset.tab === t));
        body.innerHTML = ""; body.appendChild(this._settingsTab(t, from));
      };
      node.querySelectorAll(".tab").forEach(x => x.addEventListener("click", () => { GG.bus.emit("ui:nav"); showTab(x.dataset.tab); }));
      click(node, '[data-a="back"]', () => { GG.bus.emit("ui:transition"); from === "pause" ? this.showPause() : this.showMainMenu(); });
      this._set(node);
      showTab(tab);
    },

    /** Build the content node for one settings tab. */
    _settingsTab(t, from) {
      const s = GG.save.settings;
      const tog = (on) => `<div class="toggle ${on ? "on" : ""}"><div class="knob"></div></div>`;
      const wrap = el(`<div></div>`);
      const wireToggles = () => wrap.querySelectorAll("[data-t]").forEach(span => span.addEventListener("click", () => {
        const key = span.dataset.t; const grp = span.dataset.grp === "gameplay" ? s.gameplay : s.graphics;
        grp[key] = !grp[key]; span.querySelector(".toggle").classList.toggle("on");
        GG.game.applySettings(); GG.save.saveSettings(); GG.bus.emit("ui:click");
      }));

      if (t === "audio") {
        wrap.innerHTML = `
          <div class="section-title">🔊 Sound Crystals</div>
          ${this._crystalRow("Master", "master", s.audio.master)}
          ${this._crystalRow("Music", "music", s.audio.music)}
          ${this._crystalRow("Effects", "sfx", s.audio.sfx)}
          ${this._crystalRow("Voice", "voice", s.audio.voice, "g")}`;
        wrap.querySelectorAll(".crystal-bar").forEach(bar => {
          const key = bar.dataset.k;
          bar.querySelectorAll(".seg").forEach((seg, i) => seg.addEventListener("click", () => {
            const v = (i + 1) / 10; s.audio[key] = v;
            bar.querySelectorAll(".seg").forEach((sg, j) => sg.classList.toggle("on", j <= i));
            GG.game.applySettings(); GG.save.saveSettings(); GG.bus.emit("ui:nav");
          }));
        });
      } else if (t === "graphics") {
        const card = (m, ico, label) => `<div class="gfx-card ${s.graphics.displayMode === m ? "active" : ""}" data-mode="${m}"><span class="art">${ico}</span>${label}</div>`;
        wrap.innerHTML = `
          <div class="section-title">🖥 Display — 1920×1080 · 16:9</div>
          <div class="gfx-cards">
            ${card("borderless", "🖼", "Borderless")}
            ${card("fullscreen", "⛶", "Fullscreen")}
            ${card("windowed", "🗔", "Windowed")}
          </div>
          <div class="field"><label>Dynamic lighting</label><span data-t="lighting">${tog(s.graphics.lighting)}</span></div>
          <div class="field"><label>Bloom (subtle)</label><span data-t="bloom">${tog(s.graphics.bloom)}</span></div>
          <div class="field"><label>Weather &amp; fog</label><span data-t="weather">${tog(s.graphics.weather)}</span></div>
          <div class="field"><label>Split-screen</label><span data-t="splitscreen">${tog(s.graphics.splitscreen)}</span></div>
          <div class="field"><label>Screen shake</label><span data-t="shake">${tog(s.graphics.shake)}</span></div>
          <div class="field"><label>Particles</label><span data-t="particles">${tog(s.graphics.particles)}</span></div>`;
        wrap.querySelectorAll(".gfx-card").forEach(c => c.addEventListener("click", () => {
          s.graphics.displayMode = c.dataset.mode;
          this._toggleFullscreen(c.dataset.mode !== "windowed");
          wrap.querySelectorAll(".gfx-card").forEach(x => x.classList.toggle("active", x === c));
          GG.save.saveSettings(); GG.bus.emit("ui:click");
        }));
        wireToggles();
      } else if (t === "gameplay") {
        wrap.innerHTML = `
          <div class="section-title">🎮 Gameplay</div>
          <div class="field"><label>Language</label>
            <select data-sel="language">
              <option value="en" ${s.gameplay.language === "en" ? "selected" : ""}>English</option>
              <option value="es" ${s.gameplay.language === "es" ? "selected" : ""}>Español</option>
              <option value="fr" ${s.gameplay.language === "fr" ? "selected" : ""}>Français</option>
            </select></div>
          <div class="field"><label>Hold to restart (safety)</label><span data-t="holdToRestart" data-grp="gameplay">${tog(s.gameplay.holdToRestart)}</span></div>
          <div class="row" style="margin-top:14px;"><button class="btn small danger nav" data-a="reset"><span class="ico">🗑</span>Reset Save</button></div>`;
        wrap.querySelector('[data-sel="language"]').addEventListener("change", (e) => { s.gameplay.language = e.target.value; GG.save.saveSettings(); });
        click(wrap, '[data-a="reset"]', () => { if (confirm("Erase all progress, times and achievements?")) { GG.save.resetAll(); this.toast("Save reset", "Fresh start"); } });
        wireToggles();
      } else if (t === "access") {
        wrap.innerHTML = `
          <div class="section-title">♿ Accessibility</div>
          <div class="field"><label>Colourblind assist (icons + patterns)</label><span data-t="colorblind" data-grp="gameplay">${tog(s.gameplay.colorblind)}</span></div>
          <div class="field"><label>Reduce screen shake</label><span data-t="shake">${tog(!s.graphics.shake ? true : false)}</span></div>
          <p class="hint" style="margin-top:10px;">Two heroes are colour-coded (blue = Nichols, green = Nibihah). Assist mode adds icons so colours aren't the only cue.</p>`;
        // the shake toggle here is inverted meaning "reduce"; wire specially
        wrap.querySelectorAll('[data-t="colorblind"]').forEach(span => span.addEventListener("click", () => {
          s.gameplay.colorblind = !s.gameplay.colorblind; span.querySelector(".toggle").classList.toggle("on"); GG.save.saveSettings(); GG.bus.emit("ui:click");
        }));
        wrap.querySelectorAll('[data-t="shake"]').forEach(span => span.addEventListener("click", () => {
          s.graphics.shake = !s.graphics.shake; span.querySelector(".toggle").classList.toggle("on"); GG.game.applySettings(); GG.save.saveSettings(); GG.bus.emit("ui:click");
        }));
      } else if (t === "controls") {
        wrap.appendChild(this._controlsPanel(from));
      }
      return wrap;
    },

    _crystalRow(label, key, val, cls) {
      let segs = "";
      const n = Math.round(val * 10);
      for (let i = 0; i < 10; i++) segs += `<div class="seg ${i < n ? "on" : ""} ${cls || ""}"></div>`;
      return `<div class="field"><label>${label}</label><div class="crystal-bar" data-k="${key}">${segs}</div></div>`;
    },

    /** Visual keyboard + rebinding, used inside the Controls tab. */
    _controlsPanel(from) {
      const b = GG.input.bindings;
      const short = (code) => (code || "").replace("Key", "").replace("Arrow", "").replace("Digit", "");
      // which physical codes are bound (for highlighting)
      const p1codes = new Set(Object.values(b.p0)), p2codes = new Set(Object.values(b.p1));
      const KROWS = [
        ["Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","Digit9","Digit0"],
        ["KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI","KeyO","KeyP"],
        ["KeyA","KeyS","KeyD","KeyF","KeyG","KeyH","KeyJ","KeyK","KeyL"],
        ["KeyZ","KeyX","KeyC","KeyV","KeyB","KeyN","KeyM"],
        ["ArrowLeft","ArrowUp","ArrowDown","ArrowRight"],
      ];
      const keyHtml = (code) => {
        const cls = p1codes.has(code) ? "p1" : p2codes.has(code) ? "p2" : "";
        return `<div class="key ${cls}" data-code="${code}">${short(code) || code}</div>`;
      };
      const rows = KROWS.map(r => `<div class="kbrow">${r.map(keyHtml).join("")}</div>`).join("");
      const bindRow = (p, hero, cls) => ["left","right","up","down","action","special","attack"].map(a =>
        `<button class="btn small ${cls}" data-rb="${p}:${a}"><span class="ico">${a === "up" ? "⤴" : a === "action" ? "✦" : a === "down" ? "▾" : a === "left" ? "◀" : "▶"}</span>${short(b["p"+p][a])}</button>`).join("");
      const wrap = el(`
        <div>
          <div class="section-title">⌨ Controls</div>
          <div class="center" style="margin-bottom:8px;"><div class="keyboard">${rows}</div></div>
          <div class="row between" style="margin-top:6px;">
            <span class="badge p1">Nichols · WASD</span><span class="badge p2">Nibihah · Arrows</span>
          </div>
          <div style="margin-top:8px;"><span class="badge p1">Rebind Nichols</span><div class="row" style="flex-wrap:wrap;margin-top:4px;">${bindRow(0,"Nichols","p1")}</div></div>
          <div style="margin-top:8px;"><span class="badge p2">Rebind Nibihah</span><div class="row" style="flex-wrap:wrap;margin-top:4px;">${bindRow(1,"Nibihah","p2")}</div></div>
          <div class="row back-row" style="gap:8px;"><button class="btn small nav" data-a="defaults"><span class="ico">↺</span>Restore defaults</button></div>
        </div>`);
      // live key press animation
      if (this._kbHandler) window.removeEventListener("keydown", this._kbHandler), window.removeEventListener("keyup", this._kbUp);
      this._kbHandler = (e) => { const k = wrap.querySelector(`.key[data-code="${e.code}"]`); if (k) k.classList.add("pressed"); };
      this._kbUp = (e) => { const k = wrap.querySelector(`.key[data-code="${e.code}"]`); if (k) k.classList.remove("pressed"); };
      window.addEventListener("keydown", this._kbHandler); window.addEventListener("keyup", this._kbUp);
      // rebinding
      wrap.querySelectorAll("[data-rb]").forEach(bn => bn.addEventListener("click", () => {
        const [p, a] = bn.dataset.rb.split(":");
        bn.classList.add("rebind"); const prev = bn.innerHTML; bn.innerHTML = "press…";
        GG.input.beginRebind((code) => {
          GG.input.bindings["p" + p][a] = code;
          GG.save.settings.bindings = GG.input.bindings; GG.save.saveSettings();
          GG.bus.emit("ui:confirm");
          this.showSettings(from, "controls"); // re-render to refresh highlights
        });
      }));
      click(wrap, '[data-a="defaults"]', () => { GG.input.resetBindings(); GG.save.settings.bindings = null; GG.save.saveSettings(); this.showSettings(from, "controls"); });
      return wrap;
    },

    showControls(from) { this.showSettings(from, "controls"); },

    _toggleFullscreen(on) {
      try {
        if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        else if (!on && document.exitFullscreen && document.fullscreenElement) document.exitFullscreen();
      } catch (_) {}
    },

    showCredits() {
      const a = GG.game.achievements;
      const list = GG.DEFS_ACHIEVEMENTS.map(d => `<p>${a.isUnlocked(d.id) ? "🏆" : "🔒"} <b>${d.name}</b> — ${d.desc}</p>`).join("");
      const node = el(`
        <div class="menu">
          <h2>Credits &amp; Achievements</h2>
          <p class="credits"><b>Echoes of Aether</b><br>An original cooperative puzzle-platformer.<br>Design, code, art &amp; procedural audio built from scratch — no external assets.<br>Inspired by the co-op genre; Nichols, Nibihah, the Heart Engine, all levels and mechanics are original.</p>
          <div class="divider"></div>
          <div class="badge">Achievements (${a.unlockedCount()}/${GG.DEFS_ACHIEVEMENTS.length})</div>
          <div class="credits">${list}</div>
          <div class="back-row"><button class="btn" data-a="back">Back</button></div>
        </div>`);
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node);
    },

    showAchievements() {
      const a = GG.game.achievements;
      const list = GG.DEFS_ACHIEVEMENTS.map(d => {
        const on = a.isUnlocked(d.id);
        return `<div class="field"><label>${on ? "🏆" : "🔒"} <b style="color:${on ? "var(--gold)" : "var(--muted)"}">${d.name}</b></label><span class="hint">${d.desc}</span></div>`;
      }).join("");
      const node = el(`
        <div class="menu">
          <h2>Achievements <span class="badge">${a.unlockedCount()}/${GG.DEFS_ACHIEVEMENTS.length}</span></h2>
          ${list}
          <div class="back-row"><button class="btn nav" data-a="back">Back</button></div>
        </div>`);
      click(node, '[data-a="back"]', () => this.showMainMenu());
      this._set(node); this._bindNav(node);
    },

    showQuit() {
      const node = el(`
        <div class="menu">
          <h2>Quit?</h2>
          <p class="tagline">Progress is saved automatically.</p>
          <div class="row" style="gap:8px;">
            <button class="btn danger" data-a="yes">Quit</button>
            <button class="btn" data-a="no">Cancel</button>
          </div>
        </div>`);
      click(node, '[data-a="yes"]', () => { try { window.close(); } catch (_) {} this._set(el(`<div class="menu"><h2>Thanks for playing!</h2><p class="tagline">You can close this tab now.</p><button class="btn" data-a="back">Back to menu</button></div>`)); this.menuLayer.querySelector('[data-a="back"]').addEventListener("click", () => this.showMainMenu()); });
      click(node, '[data-a="no"]', () => this.showMainMenu());
      this._set(node);
    },

    // ---- Pause -----------------------------------------------------------
    showPause() {
      const node = el(`
        <div class="menu pause-tablet">
          <h2>⏸ Paused</h2>
          <button class="btn primary nav" data-a="resume"><span class="ico">▶</span><span class="label">Resume</span></button>
          <button class="btn nav" data-a="restart"><span class="ico">↺</span><span class="label">Restart Level<span class="sub"><span class="kbd">R</span></span></span></button>
          <button class="btn nav" data-a="controls"><span class="ico">⌨</span><span class="label">Controls</span></button>
          <button class="btn nav" data-a="settings"><span class="ico">⚙</span><span class="label">Settings</span></button>
          <button class="btn nav" data-a="title"><span class="ico">🏛</span><span class="label">Return to Title</span></button>
          <button class="btn danger nav" data-a="exit"><span class="ico">🚪</span><span class="label">Exit Game</span></button>
        </div>`);
      click(node, '[data-a="resume"]', () => GG.game.resume());
      click(node, '[data-a="restart"]', () => GG.game.restartLevel());
      click(node, '[data-a="controls"]', () => this.showControls("pause"));
      click(node, '[data-a="settings"]', () => this.showSettings("pause"));
      click(node, '[data-a="title"]', () => this.transition(() => GG.game.toMenu()));
      click(node, '[data-a="exit"]', () => this.showQuit());
      this._set(node); this._bindNav(node);
    },

    // ---- Completion ------------------------------------------------------
    /** Grade a run: time under par + no deaths + all gems -> S/A/B/C. */
    _grade(res) {
      const lvl = GG.LEVELS.find(l => l.id === res.id) || {};
      const par = { easy: 120, medium: 210, hard: 320, extreme: 460 }[lvl.tier] || 210;
      let pts = 0;
      if (res.timeMs <= par * 1000) pts++;
      if (res.deaths === 0) pts++;
      if (res.totalGems > 0 && res.gems >= res.totalGems) pts++;
      return ["C", "B", "A", "S"][pts];
    },

    showComplete(game, res) {
      const p = GG.save.getLevel(res.id) || {};
      const isBest = p.bestMs === res.timeMs;
      const last = res.id >= GG.LEVEL_COUNT;
      const grade = this._grade(res);
      // persist the best grade
      const rank = { C: 0, B: 1, A: 2, S: 3 };
      if (!p.grade || rank[grade] > rank[p.grade]) { p.grade = grade; GG.save.save(); }
      const gcol = { S: "#f2c14e", A: "#6ef0a0", B: "#4fc3ff", C: "#cdb488" }[grade];
      const node = el(`
        <div class="menu">
          <h1>Level Complete!</h1>
          <div class="center" style="margin:4px 0 8px;">
            <span style="font-family:var(--font-head);font-size:40px;color:${gcol};text-shadow:0 0 22px ${gcol};">${grade}</span>
          </div>
          <p class="tagline">${res.id}. ${GG.LEVELS.find(l => l.id === res.id).name} — you escaped together.</p>
          <div class="field"><label>Time</label><span>${U.formatTime(res.timeMs)} ${isBest ? '<span class="badge ok">Best!</span>' : ""}</span></div>
          <div class="field"><label>Gems</label><span>${res.gems} / ${res.totalGems} 💎</span></div>
          <div class="field"><label>Deaths</label><span>${res.deaths} ${res.deaths === 0 ? '<span class="badge ok">Flawless</span>' : ""}</span></div>
          <div class="row" style="gap:8px;margin-top:16px;">
            ${last ? "" : '<button class="btn primary" data-a="next">Next level</button>'}
            <button class="btn" data-a="replay">Replay</button>
            <button class="btn" data-a="menu">Menu</button>
          </div>
          ${last ? '<p class="center" style="margin-top:12px;"><span class="badge ok">🏆 You finished every level — thanks for playing!</span></p>' : ""}
        </div>`);
      click(node, '[data-a="next"]', () => this.transition(() => GG.game.nextLevel()));
      click(node, '[data-a="replay"]', () => this.transition(() => GG.game.restartLevel()));
      click(node, '[data-a="menu"]', () => this.transition(() => GG.game.toMenu()));
      this._set(node); this._bindNav(node);
    },

    // ---- HUD: world-styled hero panels + objective crystal ---------------
    _buildHUD() {
      const hero = (side, cls, abIco) => `
        <div class="hud-hero ${side}">
          <div class="portrait ${cls}"><canvas width="54" height="54"></canvas></div>
          <div class="meta">
            <div class="name"><span class="pname"></span><span class="ability">${abIco}</span></div>
            <div class="crystal ${cls === "p2" ? "p2" : ""}"><i></i><i></i><i></i></div>
            <div class="respawn"></div>
          </div>
        </div>`;
      this._hud = el(`
        <div style="position:absolute;inset:0;">
          ${hero("left", "p1", "⚡")}
          ${hero("right", "p2", "🍃")}
          <div class="hud-center">
            <div class="hud-obj"></div>
            <div class="hud-stats"></div>
            <div class="hud-energy" style="width:180px;height:8px;margin:5px auto 0;border:1px solid rgba(255,224,138,.5);border-radius:6px;background:rgba(0,0,0,.5);overflow:hidden;">
              <div class="hud-energy-fill" style="height:100%;width:100%;background:linear-gradient(90deg,#6ef0a0,#4fc3ff);transition:width .15s;"></div>
            </div>
            <div class="hud-net"></div>
          </div>
          <button id="hud-pause" class="btn small ghost">⏸ Menu</button>
        </div>`);
      this._hud.style.display = "none";
      this.hudLayer.appendChild(this._hud);
      this._hud.querySelector("#hud-pause").addEventListener("click", () => GG.game.pause());
      // cache references
      this._heroEls = Array.from(this._hud.querySelectorAll(".hud-hero")).map(h => ({
        root: h, canvas: h.querySelector("canvas"), ctx: h.querySelector("canvas").getContext("2d"),
        name: h.querySelector(".pname"), crystal: h.querySelector(".crystal"), respawn: h.querySelector(".respawn"),
        portrait: h.querySelector(".portrait"),
      }));
    },
    showHUD() { if (this._hud) this._hud.style.display = "block"; },
    hideHUD() { if (this._hud) this._hud.style.display = "none"; },

    /** Called every frame: refresh objective, stats, and live hero portraits. */
    tick(game) {
      if (!this._hud || this._hud.style.display === "none") return;
      const lvl = game.level; if (!lvl) return;
      const q = (sel) => this._hud.querySelector(sel);
      const showTimer = GG.save.settings.gameplay.timer !== false;
      q(".hud-obj").innerHTML = `🎯 ${lvl.data.hint || "Reach the exits together"}`;
      q(".hud-stats").innerHTML =
        `💎 <b>${lvl.gemsCollected}/${lvl.totalGems}</b>` +
        (Object.keys(lvl.keys || {}).length ? ` · 🗝 ${Object.values(lvl.keys).reduce((a, b) => a + b, 0)}` : "") +
        ` · <span class="timer">${U.formatTime(lvl.timeMs)}</span>` +
        `${lvl.won ? ' · <span class="badge ok">✔ Escaped!</span>' : ''}`;
      // shared ability energy bar (pulses red when nearly drained)
      const fill = q(".hud-energy-fill");
      if (fill) {
        const f = lvl.energy / lvl.energyMax;
        fill.style.width = (f * 100).toFixed(0) + "%";
        fill.style.background = f < 0.25
          ? "#ff6b6b"
          : "linear-gradient(90deg,#6ef0a0,#4fc3ff)";
      }
      const net = q(".hud-net");
      net.innerHTML = (game.mode === "online" && GG.net.isOnline())
        ? `<span class="badge ok">● Online ${GG.net.isHost() ? "Host" : "Client"} · ${GG.net.latencyMs || "–"}ms</span>` : "";

      // hero panels + live portrait render
      for (let i = 0; i < 2; i++) {
        const p = lvl.players[i], h = this._heroEls[i]; if (!p || !h) continue;
        h.name.textContent = p.character.name;
        const atExit = lvl.exits[i] && lvl.exits[i].occupied;
        h.portrait.style.filter = atExit ? "brightness(1.25)" : "";
        // crystal: 3 shards; break them when defeated
        const shards = h.crystal.querySelectorAll("i");
        shards.forEach(s => s.classList.toggle("broken", p.dead));
        // respawn / "invulnerable" countdown while reviving
        if (p.dead) { const left = Math.max(0, 0.9 - p.deadTimer); h.respawn.textContent = left > 0.05 ? `Reviving ${left.toFixed(1)}s` : "…"; }
        else h.respawn.textContent = atExit ? "At the gate ✦" : "";
        // draw the live character into the portrait
        this._drawPortrait(h.ctx, p);
      }
    },

    _drawPortrait(ctx, p) {
      ctx.clearRect(0, 0, 54, 54);
      const bg = ctx.createLinearGradient(0, 0, 0, 54);
      bg.addColorStop(0, "#2b2340"); bg.addColorStop(1, "#191330");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, 54, 54);
      ctx.save();
      const oldFace = p.facing;
      ctx.translate(27, 50); ctx.scale(1.35, 1.35);
      ctx.translate(-p.cx, -(p.y + p.h));
      try { p.render(ctx); } catch (_) {}
      p.facing = oldFace;
      ctx.restore();
    },

    // ---- Toast + achievement popups -------------------------------------
    toast(title, sub) {
      const t = el(`<div class="toast"><span class="a-title">${title}</span>${sub ? " — " + sub : ""}</div>`);
      this.hudLayer.appendChild(t);
      setTimeout(() => t.remove(), 2600);
    },
  };

  // Achievement unlock -> toast.
  GG.bus.on("achievement:unlocked", (d) => ui.toast("🏆 " + d.name, d.desc));
  GG.bus.on("level:loaded", (d) => { if (d.hint) ui.toast("Level " + d.id, d.name); });

  GG.ui = ui;
})(window);

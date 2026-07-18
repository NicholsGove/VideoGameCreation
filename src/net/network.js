/* =========================================================================
 * network.js — online co-op via PeerJS (WebRTC), host-authoritative
 * -------------------------------------------------------------------------
 * Model
 *   • HOST runs the full authoritative simulation and controls player 0.
 *   • CLIENT sends ONLY its raw input (booleans) each frame and renders the
 *     snapshots the host broadcasts. The host never trusts client positions,
 *     which is the core anti-cheat guarantee — a client cannot teleport,
 *     phase through walls, or fake puzzle state, because it doesn't simulate.
 *
 * Lobby codes
 *   PeerJS ids are long; for a friendly 5-char code we namespace the id as
 *   "circuitbloom-<CODE>". The host claims that id; the client connects to it.
 *
 * If PeerJS failed to load (offline), online mode reports unavailable and the
 * rest of the game (local co-op) is unaffected.
 * ========================================================================= */
(function (global) {
  "use strict";
  const GG = global.GG;
  const PREFIX = "circuitbloom-";

  class NetworkManager {
    constructor() {
      this.mode = "off";           // "off" | "host" | "client"
      this.peer = null;
      this.conn = null;
      this.connected = false;
      this.code = null;
      this.latencyMs = 0;
      this._lastPing = 0;
      this._handlers = { input: null, state: null, level: null, chat: null };
      this._onOpen = null;
    }

    available() { return typeof global.Peer !== "undefined"; }

    _status(status, detail) {
      GG.bus.emit("net:status", { status, detail, mode: this.mode });
    }

    // ---- Host ------------------------------------------------------------
    host() {
      return new Promise((resolve, reject) => {
        if (!this.available()) return reject(new Error("Online play requires an internet connection (PeerJS failed to load)."));
        this.mode = "host";
        this.code = GG.util.makeCode(5);
        this._status("hosting", this.code);
        this.peer = new global.Peer(PREFIX + this.code, { debug: 1 });

        this.peer.on("open", () => { this._status("waiting", this.code); resolve(this.code); });
        this.peer.on("error", (err) => {
          // ID taken -> pick another code and retry once.
          if (String(err).includes("unavailable-id")) {
            this.code = GG.util.makeCode(5);
            this.peer.destroy();
            this.peer = new global.Peer(PREFIX + this.code, { debug: 1 });
            this.peer.on("open", () => { this._status("waiting", this.code); resolve(this.code); });
            this.peer.on("connection", (c) => this._bindConn(c));
            this.peer.on("error", (e2) => { this._status("error", String(e2)); reject(e2); });
            return;
          }
          this._status("error", String(err)); reject(err);
        });
        this.peer.on("connection", (c) => this._bindConn(c));
      });
    }

    // ---- Client ----------------------------------------------------------
    join(code) {
      return new Promise((resolve, reject) => {
        if (!this.available()) return reject(new Error("Online play requires an internet connection (PeerJS failed to load)."));
        this.mode = "client";
        this.code = String(code).toUpperCase().trim();
        this._status("connecting", this.code);
        this.peer = new global.Peer({ debug: 1 });
        this.peer.on("open", () => {
          const conn = this.peer.connect(PREFIX + this.code, { reliable: true });
          this._bindConn(conn);
          this._onOpen = resolve;
          // Timeout if host never answers.
          setTimeout(() => { if (!this.connected) { this._status("error", "No host found for that code."); reject(new Error("No host found for code " + this.code)); } }, 9000);
        });
        this.peer.on("error", (err) => { this._status("error", String(err)); reject(err); });
      });
    }

    _bindConn(conn) {
      this.conn = conn;
      conn.on("open", () => {
        this.connected = true;
        this._status("connected", this.code);
        GG.bus.emit("net:connected", { mode: this.mode });
        if (this._onOpen) { this._onOpen(); this._onOpen = null; }
        this._startPing();
      });
      conn.on("data", (msg) => this._onMessage(msg));
      conn.on("close", () => { this.connected = false; this._status("closed"); GG.bus.emit("net:disconnected", {}); });
      conn.on("error", (e) => this._status("error", String(e)));
    }

    _onMessage(msg) {
      switch (msg.t) {
        case "input": if (this._handlers.input) this._handlers.input(msg.d); break;
        case "state": if (this._handlers.state) this._handlers.state(msg.d); break;
        case "level": if (this._handlers.level) this._handlers.level(msg.d); break;
        case "ping":  this._send({ t: "pong", d: msg.d }); break;
        case "pong":  this.latencyMs = Date.now() - msg.d; break;
      }
    }

    _startPing() {
      this._pingTimer = setInterval(() => {
        if (this.connected) this._send({ t: "ping", d: Date.now() });
      }, 1500);
    }

    _send(obj) { try { if (this.conn && this.connected) this.conn.send(obj); } catch (_) {} }

    // ---- Public API used by the game controller -------------------------
    onInput(fn) { this._handlers.input = fn; }      // host: receive client input
    onState(fn) { this._handlers.state = fn; }      // client: receive host snapshot
    onLevel(fn) { this._handlers.level = fn; }      // client: receive level/char setup

    sendInput(input) { this._send({ t: "input", d: input }); }        // client -> host
    sendState(snap)  { this._send({ t: "state", d: snap }); }         // host -> client
    sendLevel(info)  { this._send({ t: "level", d: info }); }         // host -> client

    isHost() { return this.mode === "host"; }
    isClient() { return this.mode === "client"; }
    isOnline() { return this.mode !== "off" && this.connected; }

    close() {
      if (this._pingTimer) clearInterval(this._pingTimer);
      try { if (this.conn) this.conn.close(); } catch (_) {}
      try { if (this.peer) this.peer.destroy(); } catch (_) {}
      this.mode = "off"; this.peer = null; this.conn = null;
      this.connected = false; this.code = null;
      this._status("off");
    }
  }

  GG.NetworkManager = NetworkManager;
  GG.net = new NetworkManager();
})(window);

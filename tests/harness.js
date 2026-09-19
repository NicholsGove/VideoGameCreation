/* Shared headless harness: stubs the DOM and loads the real game files. */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
function grad() { return { addColorStop() {} }; }
function ctx2d() {
  return new Proxy({}, {
    get: (t, k) => {
      if (k === "createLinearGradient" || k === "createRadialGradient" || k === "createPattern") return () => grad();
      if (k === "measureText") return () => ({ width: 10 });
      if (k === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (k === "canvas") return { width: 1920, height: 1080 };
      if (k in t) return t[k];
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function el() {
  const e = {
    getContext: () => ctx2d(), style: {}, dataset: {}, width: 0, height: 0, innerHTML: "",
    appendChild() {}, remove() {}, addEventListener() {}, removeEventListener() {},
    querySelector() { return el(); }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1920, height: 1080 }; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  };
  e.content = { firstElementChild: e };
  return e;
}
global.window = global;
global.performance = { now: () => Date.now() };
global.requestAnimationFrame = () => 0;
try { Object.defineProperty(global, "navigator", { value: { getGamepads: () => [] }, configurable: true }); } catch (_) {}
global.addEventListener = () => {};
global.removeEventListener = () => {};
global.localStorage = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
global.document = { createElement: () => el(), getElementById: () => el(), addEventListener() {}, readyState: "complete", documentElement: {}, hidden: false };
function load(files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, "src", f), "utf8"), { filename: f });
}
module.exports = { load, ROOT, el };

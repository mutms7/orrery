// Loads the real index.html, stubs out the DOM/canvas, runs the actual simulation
// through its debug hook, and checks the physics invariants. No browser needed.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

const htmlPath = path.join(__dirname, "..", "index.html");
const html = fs.readFileSync(htmlPath, "utf8");

// --- structural guards (catch packaging mistakes before they reach a browser) ---
test("index.html has a properly closed script tag", () => {
  const open = (html.match(/<script>/g) || []).length;
  const close = (html.match(/<\/script>/g) || []).length;
  assert.equal(open, 1, "expected exactly one <script>");
  assert.equal(close, 1, "expected exactly one </script> (an unclosed tag will not run in a browser)");
  assert.ok(html.lastIndexOf("</script>") > html.indexOf("<script>"), "</script> must come after <script>");
});

test("page is self-contained (no external scripts or stylesheets)", () => {
  assert.ok(!/<script[^>]+src=/.test(html), "no external <script src>");
  assert.ok(!/<link[^>]+stylesheet/.test(html), "no external stylesheet links");
});

// --- run the actual simulation in a stubbed environment ---
function boot() {
  const js = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
  assert.ok(js.length > 1000, "extracted script looks too small");

  const gradient = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(_, p) {
      if (p === "createRadialGradient" || p === "createLinearGradient") return () => gradient;
      if (p === "measureText") return () => ({ width: 0 });
      return () => {};
    },
    set() { return true; },
  });
  const inputs = {};
  for (const tag of html.match(/<input[^>]*>/g) || []) {
    const id = (tag.match(/id="([^"]+)"/) || [])[1];
    if (!id) continue;
    inputs[id] = {
      value: (tag.match(/value="([^"]+)"/) || [])[1] || "1",
      min: (tag.match(/min="([^"]+)"/) || [])[1] || "0",
      max: (tag.match(/max="([^"]+)"/) || [])[1] || "1",
    };
  }
  const els = new Map();
  const makeEl = (id) => {
    const d = inputs[id] || {};
    return {
      value: d.value || "1", min: d.min || "0", max: d.max || "1",
      textContent: "", innerHTML: "", dataset: {}, width: 0, height: 0,
      style: { setProperty() {}, width: "", height: "" },
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      getContext: () => ctx, getBoundingClientRect: () => ({ width: 0, height: 0 }),
      setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
      setPointerCapture() {}, toDataURL: () => "", click() {}, appendChild() {}, focus() {},
    };
  };
  const document = {
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement: () => makeEl(),
    querySelector() { return makeEl(); },
    querySelectorAll() { return []; },
    addEventListener() {},
    get hidden() { return false; },
    documentElement: { setAttribute() {}, getAttribute() { return null; }, clientWidth: 1280, clientHeight: 720 },
    body: { children: [] },
  };
  const window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    matchMedia: () => ({ matches: false }), addEventListener() {},
  };
  const sandbox = {
    window, document, Math, console, parseFloat, parseInt, isNaN, JSON, Date,
    requestAnimationFrame() {}, setTimeout() {}, setInterval: () => 0, clearInterval() {}, clearTimeout() {},
  };
  vm.createContext(sandbox);
  vm.runInContext(js, sandbox, { filename: "orrery.js" });
  assert.ok(window.__orrery, "debug hook window.__orrery should be defined after init");
  return window.__orrery;
}

test("starts with a star and planets, using the real defaults", () => {
  const O = boot();
  const st = O.state();
  assert.ok(st.count >= 8 && st.star, "expected a star plus planets");
  assert.equal(O.sett.G, 0.9);
  assert.equal(O.sett.starMass, 2600);
});

test("a controlled circular orbit stays bound and near-circular", () => {
  const O = boot();
  O.clear();
  O.sett.star = true; O.ensureStar();
  O.sett.collide = "off";
  const R = 220, M = O.sett.starMass;
  const vc = Math.sqrt(O.sett.G * M / R);
  O.addBody(O.cam.x + R, O.cam.y, 0, vc, 40);
  let minR = Infinity, maxR = 0;
  for (let i = 0; i < 60; i++) {
    O.step(20);
    const b = O.bodies().find((x) => !x.fixed);
    const r = Math.hypot(b.x - O.cam.x, b.y - O.cam.y);
    minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  assert.ok(maxR < R * 1.4 && minR > R * 0.6, `orbit drifted: min=${minR.toFixed(0)} max=${maxR.toFixed(0)}`);
  assert.equal(O.state().count, 1);
});

test("nothing ever exceeds the speed cap", () => {
  const O = boot();
  O.preset("chaos");
  O.step(400);
  const maxV = Math.max(...O.bodies().filter((b) => !b.fixed).map((b) => Math.hypot(b.vx, b.vy)));
  assert.ok(maxV <= 16.001, `max speed ${maxV}`);
});

test("merge collapses many bodies into fewer, heavier ones", () => {
  const O = boot();
  O.sett.collide = "merge";
  O.preset("chaos");
  const before = O.state().count;
  const avgBefore = O.bodies().filter((b) => !b.fixed).reduce((s, b) => s + b.m, 0) / before;
  O.step(1500);
  const survivors = O.bodies().filter((b) => !b.fixed);
  const avgAfter = survivors.reduce((s, b) => s + b.m, 0) / (survivors.length || 1);
  assert.ok(survivors.length < before, `count did not drop: ${before} -> ${survivors.length}`);
  assert.ok(O.state().merges > 0, "no merges recorded");
  assert.ok(avgAfter > avgBefore, `average mass did not grow: ${avgBefore.toFixed(0)} -> ${avgAfter.toFixed(0)}`);
});

test("bounce mode never removes bodies", () => {
  const O = boot();
  O.preset("rings");
  O.sett.collide = "bounce";
  const before = O.state().count;
  O.step(400);
  assert.equal(O.state().count, before);
});

test("bounce is perfectly elastic (restitution 1) for object-object collisions", () => {
  const O = boot();
  O.clear();
  O.sett.star = false;
  O.sett.G = 0;            // isolate the collision from gravity
  O.sett.collide = "bounce";
  O.addBody(O.cam.x - 60, O.cam.y, 4, 0, 40);
  O.addBody(O.cam.x + 60, O.cam.y, -4, 0, 40);
  const ke = () => O.bodies().filter((b) => !b.fixed).reduce((s, b) => s + 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy), 0);
  const before = ke();
  O.step(40); // let them meet and separate
  const after = ke();
  assert.ok(Math.abs(after - before) / before < 0.01, `kinetic energy not conserved: ${before.toFixed(1)} -> ${after.toFixed(1)}`);
  const vxs = O.bodies().filter((b) => !b.fixed).map((b) => b.vx);
  assert.ok(vxs.some((v) => v < -0.5) && vxs.some((v) => v > 0.5), "bodies did not rebound off each other");
});

test("no NaN or Infinity leaks into the state", () => {
  const O = boot();
  O.preset("bigbang");
  O.step(300);
  const bad = O.bodies().some((b) => !Number.isFinite(b.x) || !Number.isFinite(b.y) || !Number.isFinite(b.vx));
  assert.ok(!bad, "found a non-finite value");
});

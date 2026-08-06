/**
 * 在 Node 裡載入重構前的 PWA 引擎,作為平價測試的參照實作。
 *
 * 用 vm 沙箱跑凍結的原始 <script>,搭配最小 DOM stub。
 * 重點是「參照必須是真的出貨程式碼」——所以不手抄,直接執行原檔。
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const LEGACY = path.join(__dirname, "fixtures", "legacy-engine-4916c0a.js");

/** 最小 DOM 元素 stub:接受任何讀寫,querySelectorAll 一律回空陣列 */
function el() {
  return {
    value: "", textContent: "", innerHTML: "", disabled: false,
    style: {}, dataset: {}, files: [],
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, click() {}, focus() {},
    querySelectorAll() { return []; }, querySelector() { return el(); },
    appendChild() {}, remove() {}
  };
}

function makeSandbox() {
  const store = {};
  const nodes = {};
  const document = {
    getElementById(id) { return nodes[id] || (nodes[id] = el()); },
    querySelectorAll() { return []; },
    querySelector() { return el(); },
    createElement() { return el(); },
    addEventListener() {},
    body: el()
  };
  const sandbox = {
    console,
    document,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    /* 開機 IIFE 會呼叫 fetch;讓它立即失敗,錯誤由原程式的 catch 接住 */
    fetch: () => Promise.reject(new Error("legacy sandbox: 不連網")),
    AbortSignal: { timeout: () => null },
    setTimeout, clearTimeout, Date, Math, JSON, Number, String, Object, Array,
    URL: { createObjectURL: () => "blob:stub", revokeObjectURL() {} },
    Blob: function () {}, FileReader: function () {},
    confirm: () => true, alert: () => {},
    location: { reload() {} },
    window: null
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

/**
 * 載入參照實作。
 * @returns 參照引擎的內部函式與可變狀態 {S, Q, INST, P, makePlan, render, totals, tierTarget, sigBad, ...}
 */
function loadLegacy() {
  const src = fs.readFileSync(LEGACY, "utf8");
  /* 原檔頂層用 const/let 宣告,那些綁定留在 script 的語彙環境裡,
     沙箱物件上讀不到。在同一份 source 尾端追加匯出,才拿得到。 */
  const exportTail = `
;globalThis.__legacy = {
  get S(){return S}, get Q(){return Q}, get INST(){return INST},
  P, LIVE, INV, hasId, pxTWD, valTWD, totals, tierTarget, sigBad,
  makePlan, render, numOk, fin, esc
};`;
  const sandbox = makeSandbox();
  vm.createContext(sandbox);
  new vm.Script(src + exportTail, { filename: "legacy-engine-4916c0a.js" }).runInContext(sandbox);
  const L = sandbox.__legacy;
  if (!L || typeof L.makePlan !== "function") throw new Error("參照實作載入失敗");
  return L;
}

/**
 * 用給定情境驅動參照實作,回傳它的計畫。
 * 走原程式自己的 render(false) → makePlan(st) 路徑,不繞過任何邏輯。
 */
function legacyPlan(L, sc) {
  /* 直接改寫參照實作的可變狀態 */
  L.S.units = Object.assign({}, sc.units);
  L.S.prem = Object.assign({}, sc.prem || {});
  L.S.cashTWD = sc.cashTWD || 0;
  L.S.cashUSD = sc.cashUSD || 0;
  L.S.peak = sc.peak || 0;
  L.S.tierTc = sc.tierTc;
  /* INST 是 const 綁定,不能重新指派,只能就地換內容 */
  L.INST.length = 0;
  sc.inst.forEach(i => L.INST.push(Object.assign({}, i)));

  L.Q.px = Object.assign({}, sc.prices);
  L.Q.fx = sc.fx;
  L.Q.sig = sc.signal;

  const st = L.render(false);
  return { st, plan: L.makePlan(st) };
}

module.exports = { loadLegacy, legacyPlan, LEGACY };

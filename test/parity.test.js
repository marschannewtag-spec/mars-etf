/**
 * 平價測試:共用引擎 vs 重構前的 PWA 實作。
 *
 * 這條測試的目的是證明「把引擎抽成共用模組」沒有改變任何一個決策。
 * 參照實作是 commit 4916c0a 的 index.html <script> 原文,
 * 在 vm 沙箱裡執行——不是手抄,所以不會因為抄錯而假性通過。
 *
 * 比對的是決策內容(持股、現金、訂單方向與股數),不是格式化字串。
 */
"use strict";
const { describe, it } = require("./harness.js");
const E = require("../engine/engine.js");
const { loadLegacy, legacyPlan } = require("./legacy.js");

const P = E.PARAMS;
const L = loadLegacy();

function rng(seed) {
  let s = seed >>> 0;
  return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function randomScenario(rand) {
  const n = 1 + Math.floor(rand() * 6);
  const inst = [];
  for (let k = 0; k < n; k++) {
    inst.push({
      id: "S" + k, name: "標的" + k,
      tgt: Math.round(rand() * 40) / 100,
      src: "tw",
      pocket: rand() < 0.5 ? "core" : "sat"
    });
  }
  if (rand() < 0.3) inst.push({ id: "", name: "", tgt: Math.round(rand() * 10) / 100, src: "tw", pocket: "sat" });

  const prices = {}, units = {}, prem = {};
  inst.forEach(i => {
    if (!i.id) return;
    prices[i.id] = Math.round((1 + rand() * 500) * 100) / 100;
    units[i.id] = Math.floor(rand() * 3000);
    if (rand() < 0.2) prem[i.id] = Math.round(rand() * 400) / 100;
  });
  if (rand() < 0.12 && inst[0].id) delete prices[inst[0].id];

  const tiers = [P.BASE, 0.10, 0.05];
  return {
    inst, units, prem, prices,
    fx: 25 + rand() * 15,
    cashTWD: Math.floor(rand() * 3000000),
    cashUSD: 0,
    peak: rand() < 0.2 ? 0 : Math.floor(rand() * 5000000),
    tierTc: tiers[Math.floor(rand() * tiers.length)],
    signal: {
      risk_flag: rand() < 0.35,
      spx: { last: 7000, sma12m: 6800, below: false },
      vix: { last: 16, above: false },
      asof: { spx: "2026-08-05" }
    }
  };
}

/**
 * 參照實作的物件建立在 vm 沙箱的 realm 裡,prototype 與主 realm 不同,
 * deepStrictEqual 會因此判定不相等——即使內容完全一樣。
 * 兩邊都做一次 JSON 往返,拉回同一個 realm 再比。
 */
const rehydrate = x => JSON.parse(JSON.stringify(x));

/** 把兩邊的計畫化為可直接比對的正規形式 */
function normalizeNew(plan) {
  if (plan.kind === "hold") return { hold: plan.message };
  return rehydrate({
    units: plan.units,
    cash: plan.cash,
    orders: plan.orders.map(o => ({ id: o.id, side: o.side, shares: o.shares, amount: o.amount }))
      .sort((a, b) => a.id.localeCompare(b.id))
  });
}

/** 參照實作的訂單是格式化字串,解析回結構化資料 */
function normalizeLegacy(plan) {
  if (plan.hold) return { hold: plan.hold };
  return rehydrate({
    units: plan.units,
    cash: plan.cash,
    orders: plan.orders.map(o => {
      const m = o.m.match(/^(\S+)\s+(買入|賣出)\s+([\d,]+)\s+股\(約\s+([\d,]+)\s+TWD\)/);
      if (!m) throw new Error("無法解析參照訂單:" + o.m);
      return {
        id: m[1], side: m[2] === "買入" ? "buy" : "sell",
        shares: Number(m[3].replace(/,/g, "")),
        amountRounded: Number(m[4].replace(/,/g, ""))
      };
    }).sort((a, b) => a.id.localeCompare(b.id))
  });
}

const N = 4000;

describe("平價 · 共用引擎 vs 重構前 PWA(commit 4916c0a)", () => {
  it(`${N} 個隨機情境:狀態計算(V/cash/cf/dd/miss)完全一致`, (a) => {
    const rand = rng(20260806);
    for (let k = 0; k < N; k++) {
      const sc = randomScenario(rand);
      const { st: stL } = legacyPlan(L, sc);
      const ctx = { inst: sc.inst, units: sc.units, prem: sc.prem, prices: sc.prices, fx: sc.fx, cashTWD: sc.cashTWD, cashUSD: sc.cashUSD };
      const stN = E.computeState(ctx, { peak: sc.peak, tierTc: sc.tierTc, signal: sc.signal });
      a.strictEqual(stN.V, stL.V, `第 ${k} 個情境 V 不一致`);
      a.strictEqual(stN.cash, stL.cash, `第 ${k} 個情境 cash 不一致`);
      a.strictEqual(stN.cf, stL.cf, `第 ${k} 個情境 cf 不一致`);
      a.strictEqual(stN.dd, stL.dd, `第 ${k} 個情境 dd 不一致`);
      a.strictEqual(stN.miss, stL.miss, `第 ${k} 個情境 miss 不一致`);
    }
  });

  it(`${N} 個隨機情境:決策(持股/現金/訂單)完全一致`, (a) => {
    const rand = rng(20260806);
    let holds = 0, trims = 0, rebals = 0;
    for (let k = 0; k < N; k++) {
      const sc = randomScenario(rand);
      const { st, plan: planL } = legacyPlan(L, sc);
      const ctx = { inst: sc.inst, units: sc.units, prem: sc.prem, prices: sc.prices, fx: sc.fx, cashTWD: sc.cashTWD, cashUSD: sc.cashUSD };
      const planN = E.makePlan(ctx, st);

      const nl = normalizeLegacy(planL), nn = normalizeNew(planN);
      const ctxDump = () => `\n情境 #${k}:\n${JSON.stringify(sc, null, 1)}\n參照:${JSON.stringify(nl, null, 1)}\n新版:${JSON.stringify(nn, null, 1)}`;

      if (nl.hold || nn.hold) {
        a.strictEqual(!!nn.hold, !!nl.hold, "一邊 hold 一邊有計畫" + ctxDump());
        a.strictEqual(nn.hold, nl.hold, "hold 原因不一致" + ctxDump());
        holds++;
        continue;
      }
      a.deepStrictEqual(nn.units, nl.units, "持股不一致" + ctxDump());
      a.strictEqual(nn.cash, nl.cash, "現金不一致" + ctxDump());
      a.strictEqual(nn.orders.length, nl.orders.length, "訂單筆數不一致" + ctxDump());
      nn.orders.forEach((o, ix) => {
        a.strictEqual(o.id, nl.orders[ix].id, "訂單標的不一致" + ctxDump());
        a.strictEqual(o.side, nl.orders[ix].side, "買賣方向不一致" + ctxDump());
        a.strictEqual(o.shares, nl.orders[ix].shares, "股數不一致" + ctxDump());
      });
      if (planN.kind === "trim") trims++; else rebals++;
    }
    console.log(`    ${C()}涵蓋:hold ${holds} · 減碼 ${trims} · 再平衡 ${rebals}`);
    function C() { return "\x1b[90m"; }
  });

  it("分層階梯在全回撤範圍內與參照一致", (a) => {
    const tiers = [P.BASE, 0.10, 0.05];
    for (const prev of tiers) {
      for (let dd = 0; dd >= -0.90; dd -= 0.001) {
        const d = Math.round(dd * 1000) / 1000;
        a.strictEqual(E.tierTarget(d, prev), L.tierTarget(d, prev),
          `tierTarget(${d}, ${prev}) 不一致`);
      }
    }
  });

  it("訊號驗證在各種畸形回應下與參照一致", (a) => {
    const cases = [
      null, undefined, [], "boom", 42, {},
      { error: "x" },
      { risk_flag: false },
      { risk_flag: false, spx: { last: 1, sma12m: 1 }, vix: { last: 1 }, asof: { spx: "2026-01-01" } },
      { risk_flag: false, spx: { last: null, sma12m: 1 }, vix: { last: 1 }, asof: { spx: "x" } },
      { risk_flag: false, spx: { last: "7000", sma12m: "6800" }, vix: { last: "15" }, asof: { spx: "x" } },
      { risk_flag: false, spx: { last: 1, sma12m: 0 }, vix: { last: 1 }, asof: { spx: "x" } },
      { risk_flag: false, spx: { last: 1, sma12m: 1 }, vix: { last: "" }, asof: { spx: "x" } },
      { risk_flag: true, spx: { last: 1, sma12m: 1 }, vix: { last: 1 } }
    ];
    cases.forEach((c, ix) => {
      a.strictEqual(E.validateSignal(c), L.sigBad(c), `第 ${ix} 個畸形回應判定不一致:${JSON.stringify(c)}`);
    });
  });

  it("有效標的篩選與權重總和與參照一致", (a) => {
    const rand = rng(1234);
    for (let k = 0; k < 1000; k++) {
      const sc = randomScenario(rand);
      L.INST.length = 0; sc.inst.forEach(i => L.INST.push(i));
      a.strictEqual(E.live(sc.inst).length, L.LIVE().length, `第 ${k} 個情境有效標的數不一致`);
      a.strictEqual(E.weightSum(sc.inst), L.INV(), `第 ${k} 個情境權重總和不一致`);
    }
  });
});

/**
 * 不變量測試:對隨機情境驗證「無論輸入為何都必須成立」的性質。
 *
 * 黃金案例檢查特定情況下的正確答案;不變量檢查所有情況下都不會壞掉。
 * 兩者互補——不變量常抓到黃金案例想不到的組合。
 */
"use strict";
const { describe, it } = require("./harness.js");
const E = require("../engine/engine.js");
const P = E.PARAMS;

/** 固定種子的偽亂數,確保失敗可重現 */
function rng(seed) {
  let s = seed >>> 0;
  return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/** 產生一個隨機但合法的情境 */
function randomScenario(rand) {
  const n = 1 + Math.floor(rand() * 6);
  const inst = [];
  for (let k = 0; k < n; k++) {
    inst.push({
      id: "S" + k, name: "標的" + k,
      tgt: Math.round(rand() * 40) / 100,
      src: rand() < 0.15 ? "us" : "tw",
      pocket: rand() < 0.5 ? "core" : "sat"
    });
  }
  /* 有時混入空白列 */
  if (rand() < 0.3) inst.push({ id: "", name: "", tgt: Math.round(rand() * 10) / 100, src: "tw", pocket: "sat" });

  const prices = {}, units = {}, prem = {};
  inst.forEach(i => {
    if (!i.id) return;
    prices[i.id] = Math.round((1 + rand() * 500) * 100) / 100;
    units[i.id] = Math.floor(rand() * 3000);
    if (rand() < 0.2) prem[i.id] = Math.round(rand() * 400) / 100;
  });
  /* 偶爾讓某檔沒報價 */
  if (rand() < 0.15 && inst[0].id) delete prices[inst[0].id];

  const fx = rand() < 0.05 ? null : 25 + rand() * 15;
  const ctx = {
    inst, units, prem, prices, fx,
    cashTWD: Math.floor(rand() * 3000000),
    cashUSD: rand() < 0.2 ? Math.floor(rand() * 50000) : 0
  };
  const tiers = [P.BASE, 0.10, 0.05];
  const prior = {
    peak: rand() < 0.2 ? 0 : Math.floor(rand() * 5000000),
    tierTc: tiers[Math.floor(rand() * tiers.length)],
    signal: {
      risk_flag: rand() < 0.35,
      spx: { last: 7000, sma12m: 6800, below: false },
      vix: { last: 16, above: false },
      asof: { spx: "2026-08-05" }
    }
  };
  return { ctx, prior };
}

const N = 3000;

describe("不變量 · 計畫的結構性質", () => {
  it(`${N} 個隨機情境:股數必為非負整數、現金非負、現金守恆(誤差 <1 元)`, (a) => {
    const rand = rng(20260806);
    const problems = [];
    for (let k = 0; k < N; k++) {
      const { ctx, prior } = randomScenario(rand);
      const st = E.computeState(ctx, prior);
      /* 報價缺失時呼叫端本來就該中止,不納入不變量檢查 */
      if (st.miss || !Number.isFinite(st.V)) continue;
      const plan = E.makePlan(ctx, st);
      const bad = E.checkInvariants(plan, ctx, st);
      if (bad.length) problems.push({ k, bad, kind: plan.kind });
      if (problems.length > 3) break;
    }
    a.deepStrictEqual(problems, [], "不變量違反:\n" + JSON.stringify(problems, null, 1));
  });

  it(`${N} 個隨機情境:makePlan 不得拋錯,也不得產生 NaN`, (a) => {
    const rand = rng(777);
    for (let k = 0; k < N; k++) {
      const { ctx, prior } = randomScenario(rand);
      const st = E.computeState(ctx, prior);
      let plan;
      try { plan = E.makePlan(ctx, st); }
      catch (e) { a.fail(`第 ${k} 個情境拋錯:${e.message}\n${JSON.stringify({ ctx, st }, null, 1)}`); }
      if (plan.kind === "hold") continue;
      Object.keys(plan.units).forEach(key => {
        a.ok(Number.isFinite(plan.units[key]), `第 ${k} 個情境 units.${key} = ${plan.units[key]}`);
      });
      a.ok(Number.isFinite(plan.cash), `第 ${k} 個情境 cash = ${plan.cash}`);
      plan.orders.forEach(o => {
        a.ok(Number.isFinite(o.shares) && o.shares > 0, `訂單股數異常:${JSON.stringify(o)}`);
        a.ok(Number.isFinite(o.amount) && o.amount >= 0, `訂單金額異常:${JSON.stringify(o)}`);
      });
    }
  });
});

describe("不變量 · 權重", () => {
  it("目標權重合計恆為 100%(各標的 + 現金)", (a) => {
    const rand = rng(42);
    for (let k = 0; k < 500; k++) {
      const { ctx, prior } = randomScenario(rand);
      if (!E.live(ctx.inst).length) continue;
      /* 全部 tgt 皆為 0 時退回預設分母,合計不會是 1,這是刻意的保護 */
      if (E.live(ctx.inst).every(i => !i.tgt)) continue;
      a.ok(E.weightsSumToOne(ctx.inst, prior.tierTc),
        `第 ${k} 個情境權重合計不為 1(tc=${prior.tierTc})`);
    }
  });

  it("目標現金水位恆在 5%–50% 之間", (a) => {
    const rand = rng(99);
    let tc = P.BASE;
    for (let k = 0; k < 5000; k++) {
      const dd = -(rand() * 0.85);
      tc = E.tierTarget(dd, tc);
      a.ok(tc >= 0.05 && tc <= P.DEF, `tc=${tc} 超出範圍(dd=${dd.toFixed(3)})`);
    }
  });

  it("階梯必須由深到淺排列,否則遲滯邏輯會錯", (a) => {
    for (let k = 1; k < P.LADDER.length; k++) {
      a.ok(P.LADDER[k - 1][0] < P.LADDER[k][0], "LADDER 門檻必須遞增(由深到淺)");
      a.ok(P.LADDER[k - 1][1] < P.LADDER[k][1], "越深的回撤現金目標必須越低");
    }
  });
});

describe("不變量 · 風險期規格", () => {
  it("風險期任何情境下都不得產生買單", (a) => {
    const rand = rng(31337);
    for (let k = 0; k < 2000; k++) {
      const { ctx, prior } = randomScenario(rand);
      prior.signal.risk_flag = true;
      const st = E.computeState(ctx, prior);
      if (st.miss) continue;
      const plan = E.makePlan(ctx, st);
      if (plan.kind === "hold") continue;
      const buys = plan.orders.filter(o => o.side === "buy");
      a.strictEqual(buys.length, 0, `第 ${k} 個情境風險期出現買單:${JSON.stringify(buys)}`);
    }
  });

  it("風險期減碼金額恆不超過持股的 50%(容許整股取整的溢出)", (a) => {
    /* 股數必須是整數,nu = floor(cur*(1-r)) 向下取整會讓實際賣出略多於
       精算的 CAP*hold。每檔最多多賣不到一股,故寬容值 = Σ(每檔股價)。
       實測最大溢出約為總持股的 0.003%。 */
    const rand = rng(5150);
    let worstRatio = 0;
    for (let k = 0; k < 2000; k++) {
      const { ctx, prior } = randomScenario(rand);
      prior.signal.risk_flag = true;
      const st = E.computeState(ctx, prior);
      if (st.miss || !(st.V > 0)) continue;
      const plan = E.makePlan(ctx, st);
      if (plan.kind !== "trim") continue;
      const sold = plan.orders.reduce((s, o) => s + o.amount, 0);
      const holdV = st.V - st.cash;
      const slack = E.live(ctx.inst).reduce((s, i) => {
        const pt = E.priceTWD(i, ctx.prices, ctx.fx); return pt == null ? s : s + pt;
      }, 0);
      a.ok(sold <= P.CAP * holdV + slack + 1,
        `第 ${k} 個情境賣出 ${sold.toFixed(0)} 超過上限 ${(P.CAP * holdV).toFixed(0)} + 取整寬容 ${slack.toFixed(0)}`);
      if (holdV > 0) worstRatio = Math.max(worstRatio, (sold - P.CAP * holdV) / holdV);
    }
    a.ok(worstRatio < 0.01, `取整造成的最大溢出 ${(worstRatio * 100).toFixed(4)}% 應遠小於 1%`);
  });

  it("減碼後持股恆不多於減碼前", (a) => {
    const rand = rng(2718);
    for (let k = 0; k < 1500; k++) {
      const { ctx, prior } = randomScenario(rand);
      prior.signal.risk_flag = true;
      const st = E.computeState(ctx, prior);
      if (st.miss) continue;
      const plan = E.makePlan(ctx, st);
      if (plan.kind !== "trim") continue;
      Object.keys(plan.units).forEach(key => {
        a.ok(plan.units[key] <= (ctx.units[key] || 0),
          `第 ${k} 個情境 ${key} 減碼後 ${plan.units[key]} > 原持股 ${ctx.units[key] || 0}`);
      });
    }
  });
});

describe("不變量 · 分層推進", () => {
  it("峰值恆不下降", (a) => {
    const rand = rng(1618);
    let s = { peak: 1000000, tierTc: P.BASE };
    for (let k = 0; k < 5000; k++) {
      const V = rand() * 3000000;
      const next = E.advanceTier(V, s);
      a.ok(next.peak >= s.peak, `峰值下降:${s.peak} → ${next.peak}`);
      s = next;
    }
  });

  it("創新高後分層必定重置為基準", (a) => {
    const rand = rng(161803);
    let s = { peak: 1000000, tierTc: 0.05 };
    for (let k = 0; k < 2000; k++) {
      const V = rand() * 3000000;
      const next = E.advanceTier(V, s);
      if (V >= s.peak) a.strictEqual(next.tierTc, P.BASE, "創新高後分層應回到基準");
      s = next;
    }
  });
});

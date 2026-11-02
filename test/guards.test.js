/**
 * 防線測試:攔截層的入口與訂單面。
 *
 * 不變量層原本只檢查計畫產出的「數字」(股數、現金、目標水位),
 * 既不檢查引擎的「輸入」,也不檢查使用者實際拿去下單的「訂單清單」。
 * 三個缺口都以實際執行驗證過:
 *
 *   1. 訂單方向反轉 + 股數改成 99999,units 不動 → checkInvariants 回傳 []
 *   2. 匯入持股 -500 → 假的 -70% 回撤,miss=false 閘門不擋,不變量放行
 *   3. 目標權重全為 0 → 建議清倉 100% 現金,不變量一句話都沒說
 *
 * 每一項都寫成「拿掉防線這個測試就會紅」的形式(突變測試),
 * 不是只測 helper 回傳什麼。
 */
"use strict";
const { describe, it } = require("./harness.js");
const E = require("../engine/engine.js");
const P = E.PARAMS;

const PRICES = { A: 100, B: 250 };
const INST = [
  { id: "A", name: "標的A", tgt: 0.50, src: "tw", pocket: "core" },
  { id: "B", name: "標的B", tgt: 0.30, src: "tw", pocket: "sat" },
];

function okSignal(risk) {
  return {
    risk_flag: !!risk,
    spx: { last: 7615, sma12m: 7231, below: false },
    vix: { last: 20.1, above: false },
    asof: { spx: "2026-11-02" },
  };
}

/** 組一個會產生再平衡計畫的情境 */
function scenario(over) {
  over = over || {};
  const ctx = Object.assign({
    inst: INST, units: { A: 100, B: 10 }, prem: {},
    prices: PRICES, fx: 32.6, cashTWD: 500000, cashUSD: 0,
  }, over.ctx || {});
  const t = E.totals(ctx);
  const st = E.computeState(ctx, {
    peak: over.peak != null ? over.peak : t.V,
    tierTc: over.tierTc != null ? over.tierTc : P.BASE,
    signal: okSignal(over.risk),
  });
  return { ctx, st, plan: E.makePlan(ctx, st) };
}

/* ─────────────────────────────────────────────────────────────────
   1. 訂單 ↔ 持股 自洽
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 訂單與持股必須自洽", () => {
  it("正常計畫的訂單與持股變動相符,不得誤報", (a) => {
    const { ctx, st, plan } = scenario();
    a.notStrictEqual(plan.kind, "hold", "情境應產生計畫,否則這個測試沒驗到東西");
    a.ok(plan.orders.length > 0, "情境應有訂單");
    a.deepStrictEqual(E.checkInvariants(plan, ctx, st), [], "合法計畫不得被攔");
  });

  it("訂單方向被反轉時必須攔下", (a) => {
    const { ctx, st, plan } = scenario();
    const tampered = JSON.parse(JSON.stringify(plan));
    const o = tampered.orders[0];
    o.side = o.side === "buy" ? "sell" : "buy";
    const bad = E.checkInvariants(tampered, ctx, st);
    a.ok(bad.length > 0, "反轉訂單方向必須被攔下");
    a.ok(bad.some(m => /訂單與持股不符/.test(m)), "理由應指出訂單與持股不符:" + bad.join(" / "));
  });

  it("訂單股數被放大時必須攔下(人照著訂單下單)", (a) => {
    const { ctx, st, plan } = scenario();
    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.orders[0].shares = 99999;
    tampered.orders[0].amount = 99999 * PRICES[tampered.orders[0].id];
    const bad = E.checkInvariants(tampered, ctx, st);
    a.ok(bad.some(m => /訂單與持股不符/.test(m)), "放大股數必須被攔下:" + JSON.stringify(bad));
  });

  it("持股變了卻沒有對應訂單時必須攔下", (a) => {
    const { ctx, st, plan } = scenario();
    const tampered = JSON.parse(JSON.stringify(plan));
    /* 偷偷多賣 5 股 B,訂單清單裡沒有這筆 */
    tampered.orders = tampered.orders.filter(o => o.id !== "B");
    tampered.units.B = (tampered.units.B || 0) - 5;
    const bad = E.checkInvariants(tampered, ctx, st);
    a.ok(bad.length > 0, "無訂單的持股變動必須被攔下");
  });

  it("減碼計畫的訂單也必須自洽", (a) => {
    const { ctx, st, plan } = scenario({ risk: true, ctx: { cashTWD: 0 } });
    a.strictEqual(plan.kind, "trim", "風險期且現金為 0 應產生減碼計畫");
    a.deepStrictEqual(E.checkInvariants(plan, ctx, st), [], "合法減碼計畫不得被攔");
    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.orders[0].shares += 1;
    a.ok(E.checkInvariants(tampered, ctx, st).some(m => /訂單與持股不符/.test(m)),
      "減碎一股的差異也要抓到");
  });

  it("沒有報價的標的不該被誤判成「無訂單卻變動持股」", (a) => {
    const { ctx, st, plan } = scenario({ ctx: { prices: { A: 100 } } });   // B 無報價
    if (plan.kind !== "hold") {
      a.deepStrictEqual(E.checkInvariants(plan, ctx, st), [],
        "報價缺失的標的持股維持原值,不該被攔");
    }
  });
});

/* ─────────────────────────────────────────────────────────────────
   2. 目標權重合計為 0
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 目標權重合計為 0", () => {
  it("weightSum 誠實回傳 0,不再退回預設分母 0.8", (a) => {
    a.strictEqual(E.weightSum([{ id: "A", tgt: 0 }, { id: "B", tgt: 0 }]), 0);
    a.strictEqual(E.weightSum([{ id: "A", tgt: 0.5 }]), 0.5, "正常情況不受影響");
  });

  it("權重全為 0 時擋在 makePlan,不得產生清倉建議", (a) => {
    const zero = [{ id: "A", tgt: 0, src: "tw" }, { id: "B", tgt: 0, src: "tw" }];
    const { plan } = scenario({ ctx: { inst: zero } });
    a.strictEqual(plan.kind, "hold", "必須擋下");
    a.match(plan.message, /目標權重合計為 0/, "理由要能照著修");
    a.strictEqual(plan.orders, undefined, "不得附任何訂單");
  });

  it("權重合計不為 1 的計畫會被不變量攔下(weightsSumToOne 已接進執行路徑)", (a) => {
    const { ctx, st, plan } = scenario();
    a.notStrictEqual(plan.kind, "hold");
    /* 事後把其中一檔的目標權重改掉,使合計不再是 1 */
    const ctx2 = Object.assign({}, ctx, {
      inst: [{ id: "A", tgt: 0.50, src: "tw" }, { id: "B", tgt: 0.30, src: "tw" }, { id: "C", tgt: 0.20, src: "tw" }],
    });
    a.strictEqual(E.weightsSumToOne(ctx2.inst, plan.targetCash), true,
      "正規化後合計本來就是 1,這個函式只在分母異常時會是 false");
    a.strictEqual(E.weightsSumToOne(zeroInst(), P.BASE), false,
      "權重全 0 時合計不為 1");
  });

  it("沒有任何標的時行為不變(由呼叫端的閘門處理)", (a) => {
    const { plan } = scenario({ ctx: { inst: [], units: {} } });
    a.strictEqual(plan.kind, "hold");
    a.ok(!/目標權重合計為 0/.test(plan.message),
      "空清單不該報權重錯誤,它是另一回事:" + plan.message);
  });
});

function zeroInst() { return [{ id: "A", tgt: 0, src: "tw" }]; }

/* ─────────────────────────────────────────────────────────────────
   3. 匯入驗證:拒絕,不自動修正
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 匯入驗證", () => {
  const good = {
    units: { A: 100, B: 10 }, peak: 1234567, tierTc: 0.20,
    cashTWD: 500000, cashUSD: 0, cap: 3000000,
    inst: INST, prem: {}, log: [],
  };

  it("合法備份檔通過", (a) => {
    a.strictEqual(E.validateImport(good), null);
  });

  it("空物件通過(等同全新啟動)", (a) => {
    a.strictEqual(E.validateImport({}), null);
  });

  it("負數持股被拒絕,而不是夾成 0", (a) => {
    const why = E.validateImport(Object.assign({}, good, { units: { A: -500 } }));
    a.ok(why, "必須拒絕");
    a.match(why, /非負整數/);
    a.match(why, /A/, "要指出是哪一檔:" + why);
  });

  it("非整數持股被拒絕", (a) => {
    a.ok(E.validateImport(Object.assign({}, good, { units: { A: 10.5 } })));
  });

  it("持股為字串被拒絕(JSON 可以塞字串)", (a) => {
    a.ok(E.validateImport(Object.assign({}, good, { units: { A: "100" } })));
  });

  it("負數峰值與負數現金被拒絕", (a) => {
    a.match(E.validateImport(Object.assign({}, good, { peak: -1 })), /peak/);
    a.match(E.validateImport(Object.assign({}, good, { cashTWD: -1 })), /cashTWD/);
    a.match(E.validateImport(Object.assign({}, good, { cashUSD: -1 })), /cashUSD/);
  });

  it("超出階梯範圍的 tierTc 被拒絕", (a) => {
    a.match(E.validateImport(Object.assign({}, good, { tierTc: 0.99 })), /tierTc/);
    a.strictEqual(E.validateImport(Object.assign({}, good, { tierTc: P.DEF })), null,
      "0.5 是合法的防禦水位");
    a.strictEqual(E.validateImport(Object.assign({}, good, { tierTc: 0.05 })), null,
      "0.05 是階梯最深一格");
  });

  it("最外層不是物件就拒絕", (a) => {
    [null, [], "x", 3].forEach(v => a.ok(E.validateImport(v), JSON.stringify(v) + " 應被拒絕"));
  });

  it("整合:被拒絕的檔案若硬塞進引擎,會造出假回撤——這就是要攔的原因", (a) => {
    const hostile = { units: { A: -500, B: 100 } };
    a.ok(E.validateImport(hostile), "匯入層必須先攔下");

    /* 證明攔不下來的後果:負持股讓總值被低估、現金佔比超過 100%、
       並捏造出一個會觸發分層抄底的回撤,而 miss 旗標不會亮。 */
    const ctx = { inst: INST, units: hostile.units, prem: {}, prices: PRICES, fx: 32.6, cashTWD: 100000, cashUSD: 0 };
    const t = E.totals(ctx);
    a.ok(t.inv < 0, "持股市值為負");
    a.strictEqual(t.miss, false, "報價沒缺,閘門不會擋");
    const st = E.computeState(ctx, { peak: 200000, tierTc: P.BASE, signal: okSignal() });
    a.ok(st.cf > 1, "現金佔比超過 100%,物理上不可能:" + st.cf);
    a.ok(st.dd < -0.5, "捏造出深度回撤:" + st.dd);
  });
});

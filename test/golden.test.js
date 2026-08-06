/**
 * 黃金案例:策略規格的可執行版本。
 *
 * 每一條都對應一句白紙黑字的規則,或一個真實發生過的 bug。
 * 標記 [P0-n] 的是 2026-08 修正的三個嚴重缺陷,永久釘在這裡防止復活。
 */
"use strict";
const { describe, it } = require("./harness.js");
const E = require("../engine/engine.js");
const P = E.PARAMS;

const INST = [
  { id: "A", name: "核心A", tgt: 0.30, src: "tw", pocket: "core" },
  { id: "B", name: "核心B", tgt: 0.30, src: "tw", pocket: "core" },
  { id: "C", name: "衛星C", tgt: 0.20, src: "tw", pocket: "sat" }
];
const PRICES = { A: 200, B: 100, C: 50 };
const okSignal = over => Object.assign({
  risk_flag: false,
  spx: { last: 7723, sma12m: 7089, below: false },
  vix: { last: 15.9, above: false },
  asof: { spx: "2026-08-05" }
}, over || {});

/** 組出 ctx + st,tc 直接指定 */
function scenario(o) {
  const ctx = {
    inst: o.inst || INST, units: o.units || {}, prem: o.prem || {},
    prices: o.prices || PRICES, fx: o.fx == null ? 32 : o.fx,
    cashTWD: o.cashTWD || 0, cashUSD: o.cashUSD || 0
  };
  const st = E.computeState(ctx, { peak: o.peak || 0, tierTc: o.tierTc == null ? P.BASE : o.tierTc, signal: o.signal || okSignal() });
  if (o.dd != null) st.dd = o.dd;
  if (o.risk != null) st.risk = o.risk;
  return { ctx, st };
}

describe("黃金案例 · 風險閘門", () => {
  it("風險期且現金不足防禦水位 → 只減碼,絕不出現買單", (a) => {
    const { ctx, st } = scenario({ units: { A: 1000, B: 500, C: 400 }, cashTWD: 50000, risk: true });
    const plan = E.makePlan(ctx, st);
    a.strictEqual(plan.kind, "trim");
    a.ok(plan.orders.length > 0, "應該要有減碼單");
    a.ok(plan.orders.every(o => o.side === "sell"), "風險期不得有買單");
  });

  it("風險期減碼後現金應趨近防禦水位 50%", (a) => {
    const { ctx, st } = scenario({ units: { A: 1000, B: 500, C: 400 }, cashTWD: 50000, risk: true });
    const plan = E.makePlan(ctx, st);
    const cashAfter = plan.cash / st.V;
    a.ok(Math.abs(cashAfter - P.DEF) < 0.02, `減碼後現金比 ${(cashAfter * 100).toFixed(1)}% 應接近 50%`);
  });

  it("單次減碼不得超過持股的 50%", (a) => {
    // 現金極低,理論上想拉到 50% 需要賣掉遠超一半的持股
    const { ctx, st } = scenario({ units: { A: 1000, B: 500, C: 400 }, cashTWD: 0, risk: true });
    const plan = E.makePlan(ctx, st);
    const sold = plan.orders.reduce((s, o) => s + o.amount, 0);
    const holdV = st.V - st.cash;
    a.ok(sold <= P.CAP * holdV + 1, `賣出 ${sold.toFixed(0)} 不得超過持股 50% = ${(P.CAP * holdV).toFixed(0)}`);
  });

  it("風險期且現金已達防禦水位 → 完全不動作", (a) => {
    const { ctx, st } = scenario({ units: { A: 100 }, cashTWD: 500000, risk: true });
    const plan = E.makePlan(ctx, st);
    a.strictEqual(plan.kind, "hold");
    a.ok(/空手等待旗標熄滅/.test(plan.message));
  });

  it("[P0-3] 風險期空手 → 不得產生 NaN 或清空欄位", (a) => {
    const { ctx, st } = scenario({ units: {}, cashTWD: 0, risk: true });
    a.strictEqual(st.V, 0);
    const plan = E.makePlan(ctx, st);
    a.strictEqual(plan.kind, "hold", "空手時不該產生減碼計畫");
    a.strictEqual(plan.units, undefined, "不該回傳持股異動");
    // 舊版會回傳 units:{A:NaN}, cash:NaN,套用後 JSON 序列化成 null
  });
});

describe("黃金案例 · 分層抄底階梯", () => {
  it("回撤 -40% → 目標現金降至 10%", (a) => {
    a.strictEqual(E.tierTarget(-0.40, P.BASE), 0.10);
    a.strictEqual(E.tierTarget(-0.45, P.BASE), 0.10);
  });

  it("回撤 -50% → 目標現金降至 5%", (a) => {
    a.strictEqual(E.tierTarget(-0.50, P.BASE), 0.05);
    a.strictEqual(E.tierTarget(-0.70, P.BASE), 0.05);
  });

  it("回撤未達 -40% → 維持基準 20%", (a) => {
    a.strictEqual(E.tierTarget(0, P.BASE), 0.20);
    a.strictEqual(E.tierTarget(-0.39, P.BASE), 0.20);
    a.strictEqual(E.tierTarget(-0.399, P.BASE), 0.20);
  });

  it("遲滯回補:從 5% 需回升超過 -45% 才鬆綁到 10%", (a) => {
    a.strictEqual(E.tierTarget(-0.46, 0.05), 0.05, "-46% 仍在遲滯帶內");
    a.strictEqual(E.tierTarget(-0.45, 0.05), 0.05, "-45% 剛好在邊界上,不鬆綁");
    a.strictEqual(E.tierTarget(-0.44, 0.05), 0.10, "-44% 才鬆綁");
  });

  it("遲滯回補:從 10% 需回升超過 -35% 才回到 20%", (a) => {
    a.strictEqual(E.tierTarget(-0.36, 0.10), 0.10);
    a.strictEqual(E.tierTarget(-0.34, 0.10), 0.20);
  });

  it("[已知] dd 恰為 -35% 時遲滯提早一格鬆綁(浮點邊界)", (a) => {
    /* 遲滯條件是 dd <= 門檻 + REARM。-0.40 + 0.05 在 IEEE754 下等於
       -0.35000000000000003,所以 dd = -0.35 時比較結果為 false,
       比數學上的預期早一格鬆綁回 20%。
       -0.50 那一階剛好精確(-0.50 + 0.05 = -0.45),不受影響。

       這裡如實斷言「目前行為」而非「理想行為」:
       此為重構前既有行為,共用引擎刻意保持一致以維持平價保證。
       實務影響為零(dd 是連續浮點,恰好落在 -0.35 的機率是測度零),
       若要修正應以獨立變更提出,並同步更新此測試與參照。 */
    a.strictEqual(-0.40 + 0.05, -0.35000000000000003);
    a.strictEqual(E.tierTarget(-0.35, 0.10), 0.20, "目前行為");
    a.strictEqual(E.tierTarget(-0.45, 0.05), 0.05, "-0.50 那一階邊界精確,仍留在 5%");
  });

  it("在門檻上反覆抖動不得來回跳(whipsaw)", (a) => {
    let tc = P.BASE;
    const seen = [];
    [-0.41, -0.39, -0.41, -0.39, -0.41, -0.39].forEach(dd => { tc = E.tierTarget(dd, tc); seen.push(tc); });
    a.deepStrictEqual(seen, [0.10, 0.10, 0.10, 0.10, 0.10, 0.10], "一旦降到 10% 就不該在門檻附近彈回");
  });

  it("創新高時峰值重置且分層回到基準", (a) => {
    const r = E.advanceTier(1200000, { peak: 1000000, tierTc: 0.05 });
    a.strictEqual(r.peak, 1200000);
    a.strictEqual(r.tierTc, P.BASE);
  });

  it("未創新高時峰值不動,分層依回撤推進", (a) => {
    const r = E.advanceTier(550000, { peak: 1000000, tierTc: P.BASE });
    a.strictEqual(r.peak, 1000000, "未創新高,峰值不得變動");
    a.strictEqual(r.tierTc, 0.10, "回撤 -45% 落在 [-0.50, -0.40) → 目標現金 10%");

    const deep = E.advanceTier(450000, { peak: 1000000, tierTc: P.BASE });
    a.strictEqual(deep.tierTc, 0.05, "回撤 -55% → 目標現金 5%");
  });
});

describe("黃金案例 · 訊號驗證(fail closed)", () => {
  it("[P0-2] risk_flag 缺失 → 必須擋下,不可視為正常期", (a) => {
    const s = okSignal({ risk_flag: undefined, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    delete s.risk_flag;
    a.ok(E.validateSignal(s), "缺 risk_flag 必須回報錯誤");
    a.match(E.validateSignal(s), /risk_flag/);
  });

  it("正常回應通過驗證", (a) => {
    a.strictEqual(E.validateSignal(okSignal()), null);
  });

  it("字串型數值可容忍(JSON API 常見)", (a) => {
    a.strictEqual(E.validateSignal(okSignal({ spx: { last: "7723", sma12m: "7089", below: false }, vix: { last: "15.9", above: false } })), null);
  });

  it("null 與空字串不可通過(+ 轉型會變成 0)", (a) => {
    a.ok(E.validateSignal(okSignal({ vix: { last: null, above: false } })));
    a.ok(E.validateSignal(okSignal({ vix: { last: "", above: false } })));
    a.ok(E.validateSignal(okSignal({ spx: { last: 7723, sma12m: null, below: false } })));
  });

  it("sma12m 為 0 不可通過(會算出 Infinity%)", (a) => {
    a.ok(E.validateSignal(okSignal({ spx: { last: 7723, sma12m: 0, below: false } })));
  });

  it("缺 asof 不可通過(無法判斷資料是否過期)", (a) => {
    const s = okSignal(); delete s.asof;
    a.ok(E.validateSignal(s));
  });

  it("Worker 回錯誤物件不可通過", (a) => {
    a.ok(E.validateSignal({ error: "upstream timeout" }));
    a.ok(E.validateSignal(null));
    a.ok(E.validateSignal([]));
    a.ok(E.validateSignal("boom"));
  });

  it("獨立重算風險旗標可複核 Worker 判斷", (a) => {
    a.strictEqual(E.derivedRisk(okSignal()), false);
    a.strictEqual(E.derivedRisk(okSignal({ spx: { last: 6000, sma12m: 7089, below: true } })), true, "SPX 破 12 月均線");
    a.strictEqual(E.derivedRisk(okSignal({ vix: { last: 33, above: true } })), true, "VIX > 32");
    a.strictEqual(E.derivedRisk(okSignal({ vix: { last: 32, above: false } })), false, "VIX = 32 不算超過");
  });

  it("Worker 的 risk_flag 與本地重算不一致時要抓得出來", (a) => {
    // 盤面在崩,Worker 卻說沒事
    const s = okSignal({ risk_flag: false, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    a.strictEqual(E.riskAgrees(s), false, "應偵測到不一致");
    a.strictEqual(E.riskAgrees(okSignal()), true);
  });

  it("資料過期天數計算正確", (a) => {
    a.strictEqual(E.staleDays(okSignal(), "2026-08-06"), 1);
    a.strictEqual(E.staleDays(okSignal(), "2026-08-10"), 5);
    a.ok(E.staleDays({}, "2026-08-06") === Infinity);
  });
});

describe("黃金案例 · 空白標的列 [P0-1]", () => {
  const withBlank = INST.concat([{ id: "", name: "", tgt: 0.05, src: "tw", pocket: "sat" }]);

  it("空白列不計入有效標的", (a) => {
    a.strictEqual(E.live(withBlank).length, 3);
  });

  it("空白列不得稀釋權重總和", (a) => {
    a.strictEqual(E.weightSum(withBlank), 0.80, "應為 0.30+0.30+0.20,不含空白列的 0.05");
    a.strictEqual(E.weightSum(INST), E.weightSum(withBlank), "有無空白列結果必須相同");
  });

  it("空白列不得改變任何標的的目標權重", (a) => {
    INST.forEach(i => {
      a.strictEqual(E.targetWeight(i, P.BASE, withBlank), E.targetWeight(i, P.BASE, INST));
    });
  });

  it("空白列不得出現在下單計畫裡", (a) => {
    const { ctx, st } = scenario({ inst: withBlank, units: {}, cashTWD: 1000000 });
    const plan = E.makePlan(ctx, st);
    a.ok(plan.orders.every(o => o.id !== ""), "計畫不得包含空白代碼");
    a.ok(!("" in plan.units), "持股表不得出現空白 key");
  });

  it("單一標的加一列空白時,目標仍為滿額 80%", (a) => {
    const one = [{ id: "A", name: "a", tgt: 0.30, src: "tw", pocket: "core" }];
    const oneBlank = one.concat([{ id: "", name: "", tgt: 0.05, src: "tw", pocket: "sat" }]);
    a.strictEqual(E.targetWeight(one[0], P.BASE, oneBlank), 0.80,
      "修正前為 0.30/0.35*0.80 = 68.6%,5% 資金被幽靈標的佔住");
  });
});

describe("黃金案例 · 報價缺失", () => {
  it("有持股卻拿不到報價 → miss 為真(呼叫端必須全面中止)", (a) => {
    const ctx = { inst: INST, units: { A: 100, B: 50 }, prices: { A: 200 }, fx: 32, cashTWD: 0, cashUSD: 0 };
    a.strictEqual(E.totals(ctx).miss, true);
  });

  it("沒持股的標的拿不到報價 → 不算 miss", (a) => {
    const ctx = { inst: INST, units: { A: 100 }, prices: { A: 200 }, fx: 32, cashTWD: 0, cashUSD: 0 };
    a.strictEqual(E.totals(ctx).miss, false);
  });

  it("美股標的在匯率無效時視為無報價", (a) => {
    const us = [{ id: "SGOV", name: "s", tgt: 0.2, src: "us", pocket: "core" }];
    a.strictEqual(E.priceTWD(us[0], { SGOV: 100 }, null), null);
    a.strictEqual(E.priceTWD(us[0], { SGOV: 100 }, 32), 3200);
  });
});

describe("黃金案例 · 正常期再平衡", () => {
  it("全在容忍帶內 → 本月無動作", (a) => {
    // 先算出完美配置,再拿它當輸入
    const { ctx, st } = scenario({ units: {}, cashTWD: 1000000 });
    const first = E.makePlan(ctx, st);
    const ctx2 = Object.assign({}, ctx, { units: first.units, cashTWD: first.cash });
    const st2 = E.computeState(ctx2, { peak: 0, tierTc: P.BASE, signal: okSignal() });
    a.strictEqual(E.makePlan(ctx2, st2).kind, "hold");
  });

  it("配置到位時核心/衛星比例符合設計", (a) => {
    const { ctx, st } = scenario({ units: {}, cashTWD: 1000000 });
    const plan = E.makePlan(ctx, st);
    let core = 0, sat = 0;
    INST.forEach(i => {
      const v = plan.units[i.id] * PRICES[i.id];
      if (i.pocket === "core") core += v; else sat += v;
    });
    a.ok(Math.abs(core / st.V - 0.60) < 0.01, `核心 ${(core / st.V * 100).toFixed(1)}% 應為 60%`);
    a.ok(Math.abs(sat / st.V - 0.20) < 0.01, `衛星 ${(sat / st.V * 100).toFixed(1)}% 應為 20%`);
  });

  it("溢價超標的買單要帶警告", (a) => {
    const { ctx, st } = scenario({ units: {}, cashTWD: 1000000, prem: { A: 2.5 } });
    const plan = E.makePlan(ctx, st);
    const a1 = plan.orders.find(o => o.id === "A");
    a.strictEqual(a1.warn, "premium");
    a.strictEqual(plan.orders.find(o => o.id === "B").warn, null);
  });

  it("溢價警告只針對買單,賣單不標", (a) => {
    const { ctx, st } = scenario({ units: { A: 5000, B: 0, C: 0 }, cashTWD: 0, prem: { A: 9 } });
    const plan = E.makePlan(ctx, st);
    const sell = plan.orders.find(o => o.id === "A" && o.side === "sell");
    if (sell) a.strictEqual(sell.warn, null);
  });

  it("變動金額低於總值 0.5% 不下單(避免碎單)", (a) => {
    const { ctx, st } = scenario({ units: {}, cashTWD: 1000000 });
    const target = E.makePlan(ctx, st).units;
    // 只差一股
    const nudged = Object.assign({}, target); nudged.A -= 1;
    const ctx2 = Object.assign({}, ctx, { units: nudged, cashTWD: 1000000 - Object.keys(target).reduce((s, k) => s + target[k] * PRICES[k], 0) + PRICES.A });
    const st2 = E.computeState(ctx2, { peak: 0, tierTc: P.BASE, signal: okSignal() });
    const plan = E.makePlan(ctx2, st2);
    if (plan.kind !== "hold") {
      a.ok(!plan.orders.some(o => o.id === "A" && o.shares === 1), "一股的差額不該產生訂單");
    }
  });

  it("分層抄底作用中時計畫要標記出來", (a) => {
    const { ctx, st } = scenario({ units: {}, cashTWD: 1000000, tierTc: 0.10, dd: -0.42 });
    const plan = E.makePlan(ctx, st);
    a.strictEqual(plan.tieredBuy, true);
    a.strictEqual(plan.targetCash, 0.10);
  });
});

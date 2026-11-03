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

  /* weightsSumToOne 不該被接進 checkInvariants:它是恆真式。
     Σ targetWeight = (1-tc)*Σtgt/Σtgt = 1-tc,加上 tc 恆為 1。
     唯一例外是 Σtgt=0 導致 NaN,而那個情況上面的閘門已經擋掉。
     這裡把這個推理釘住,免得日後有人「順手」再加一道假防線。 */
  it("weightsSumToOne 是恆真式,不適合當執行期不變量", (a) => {
    [[[{ id: "A", tgt: 0.5 }, { id: "B", tgt: 0.3 }], 0.20],
     [[{ id: "A", tgt: 7 }, { id: "B", tgt: 0.001 }], P.DEF],
     [[{ id: "A", tgt: 0.5 }], 0.05]].forEach(([inst, tc]) => {
      a.strictEqual(E.weightsSumToOne(inst, tc), true,
        `Σtgt=${E.weightSum(inst)} tc=${tc} 時正規化後必然為 1`);
    });
    /* 只有分母為 0 才會是 false——而那由閘門負責,不是不變量 */
    a.strictEqual(E.weightsSumToOne(zeroInst(), P.BASE), false);
    a.strictEqual(E.weightsSumToOne([{ id: "A", tgt: 0.5 }, { id: "B", tgt: -0.5 }], P.BASE), false,
      "正負抵銷也是分母為 0");
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

  /* index.html 的 369 行 glue 與 DOM 糾纏,無法 require 進來實測。
     在抽成可測模組之前,至少把「呼叫點存在」釘住——
     否則防線寫好了卻沒接上,測試照樣全綠。
     shortcut: 只驗原始碼有呼叫,不驗實際行為;等 glue 抽成模組後改為真的跑一次匯入 */
  it("index.html 的匯入確實呼叫 validateImport", (a) => {
    const fs = require("fs"), path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    a.match(html, /EG\.validateImport\(o\)/, "匯入處必須呼叫 validateImport");
    a.match(html, /if\(why\)throw why/, "驗證結果必須真的阻止寫入");
  });

  it("index.html 的自動分配有擋權重為 0(它不走 makePlan)", (a) => {
    const fs = require("fs"), path = require("path");
    const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
    a.match(html, /if\(!\(INV\(\)>0\)\)/,
      "btnAuto 自己算配股,INV() 為 0 時會把 NaN 寫進持倉");
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

/* ─────────────────────────────────────────────────────────────────
   4. 月檢閘門 — 原本只住在 index.html,是決策卻零測試
   ───────────────────────────────────────────────────────────────── */

const FS = require("fs");
const PATH = require("path");
const readHtml = () => FS.readFileSync(PATH.join(__dirname, "..", "index.html"), "utf8");

describe("防線 · 月檢閘門", () => {
  /* 「任一觸發即中止,且不更新峰值與分層狀態」是規格的一部分。
     這份清單原本只寫在 index.html 的 runCheck 裡,沒有任何測試在守——
     而它決定要不要產生下單建議,也決定要不要推進峰值。 */
  const ctx = { inst: INST, units: { A: 100, B: 10 }, prices: PRICES, fx: 32.6 };
  const TODAY = "2026-11-02";
  const good = okSignal(false);

  it("資料齊全時不擋", (a) => {
    a.deepStrictEqual(E.gateReasons(ctx, good, TODAY), []);
  });

  it("訊號無效要擋", (a) => {
    const g = E.gateReasons(ctx, Object.assign({}, good, { risk_flag: null }), TODAY);
    a.strictEqual(g.length, 1, "得到:" + g.join(" / "));
    a.match(g[0], /訊號無效.*risk_flag/);
  });

  it("沒有任何標的要擋", (a) => {
    const g = E.gateReasons({ inst: [], prices: {}, fx: 32.6 }, good, TODAY);
    a.ok(g.some(x => /尚未設定任何標的/.test(x)), "得到:" + g.join(" / "));
  });

  it("報價缺失要擋,並點名是哪一檔", (a) => {
    const g = E.gateReasons({ inst: INST, prices: { A: 100 }, fx: 32.6 }, good, TODAY);
    a.ok(g.some(x => /報價缺失:B/.test(x)), "得到:" + g.join(" / "));
  });

  it("持股為 0 的標的報價缺失也要擋", (a) => {
    /* totals 的 miss 只在「有持股卻拿不到報價」時才亮;閘門必須比它更嚴,
       否則新加的標的抓不到價,再平衡會把它當成不存在而把錢配給別人。 */
    const g = E.gateReasons({ inst: INST, units: {}, prices: { A: 100 }, fx: 32.6 }, good, TODAY);
    a.ok(g.some(x => /報價缺失/.test(x)), "得到:" + g.join(" / "));
  });

  it("剛好等於過期門檻不擋,多一天才擋", (a) => {
    const base = Date.parse(good.asof.spx);
    const day = k => new Date(base + k * 864e5).toISOString().slice(0, 10);
    a.deepStrictEqual(E.gateReasons(ctx, good, day(P.STALE)), [],
      "延遲剛好 " + P.STALE + " 天仍可通行");
    const g = E.gateReasons(ctx, good, day(P.STALE + 1));
    a.ok(g.some(x => /市場資料過期 \d+ 天/.test(x)), "得到:" + g.join(" / "));
  });

  it("沒有資料日期時說清楚,不得印出 Infinity", (a) => {
    const g = E.gateReasons(ctx, { risk_flag: false, spx: { last: 1, sma12m: 1 }, vix: { last: 1 } }, TODAY);
    a.ok(g.some(x => /沒有日期/.test(x)), "得到:" + g.join(" / "));
    a.ok(!g.some(x => /Infinity/.test(x)), "不可把 Infinity 丟到畫面上");
  });

  it("匯率無效要擋", (a) => {
    const g = E.gateReasons({ inst: INST, prices: PRICES, fx: null }, good, TODAY);
    a.ok(g.some(x => /匯率無效/.test(x)), "得到:" + g.join(" / "));
  });

  it("index.html 的閘門改叫引擎,不得自己再算一次", (a) => {
    const html = readHtml();
    a.match(html, /EG\.gateReasons\(engCtx\(\),Q\.sig,today\)/, "呼叫點必須存在");
    a.ok(!/blockers\.push/.test(html), "閘門清單不得在網頁裡重建");
    a.ok(!/Date\.parse\(today\)-Date\.parse/.test(html), "過期天數不得在網頁裡再算一次");
  });
});

/* ─────────────────────────────────────────────────────────────────
   5. 一鍵套用的現金 — 無聲歸零會污染峰值
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 一鍵套用的現金不得無聲歸零", () => {
  it("正常情況四捨五入到千元", (a) => {
    a.strictEqual(E.cashTWDAfter(123400, 0, 32.6), 123000);
    a.strictEqual(E.cashTWDAfter(123600, 0, 32.6), 124000);
  });

  it("扣掉美元現金的台幣值(再四捨五入到千元)", (a) => {
    a.strictEqual(E.cashTWDAfter(200000, 1000, 32.6), 167000, "200000 - 32600 = 167400 → 167000");
  });

  it("美元現金超過計畫現金時回傳 null,不可夾成 0", (a) => {
    /* 原本外層包 Math.max(0, ...):台幣現金被無聲設成 0,總資產憑空蒸發,
       而蒸發後的總值會寫進峰值,污染之後所有回撤計算與分層判斷。 */
    a.strictEqual(E.cashTWDAfter(10000, 1000, 32.6), null);
    a.strictEqual(E.cashTWDAfter(-1, 0, 32.6), null);
  });

  it("匯率無效時把美元現金當 0(與 totals 一致)", (a) => {
    a.strictEqual(E.cashTWDAfter(50000, 1000, null), 50000);
  });

  it("index.html 的套用確實走這條,而且算不出來時整筆不寫入", (a) => {
    const html = readHtml();
    a.match(html, /EG\.cashTWDAfter\(plan\.cash,S\.cashUSD,Q\.fx\)/, "呼叫點必須存在");
    a.ok(!/Math\.max\(0,Math\.round\(\(plan\.cash/.test(html), "舊的無聲歸零寫法必須移除");
    /* 順序也要對:現金算不出來時不可已經把持股寫進去 */
    const apply = html.slice(html.indexOf("async function applyPlan"));
    a.ok(apply.indexOf("if(c==null)") < apply.indexOf("S.units[k]=plan.units[k]"),
      "必須先判斷再寫入,否則會只套用一半");
  });
});

/* ─────────────────────────────────────────────────────────────────
   6. 同一條規則只能有一份 — 容忍帶與扳機門檻
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 容忍帶只能有一條規則", () => {
  it("offBand 就是 makePlan 用的那條", (a) => {
    a.strictEqual(E.offBand(0.30, 0.20), true, "偏離 50% 超過容忍帶 25%");
    a.strictEqual(E.offBand(0.24, 0.20), false, "偏離 20% 仍在帶內");
    a.strictEqual(E.offBand(0.20 * (1 + P.DRIFT), 0.20), false, "剛好在邊界上不算超出");
  });

  it("index.html 的持倉卡與引擎用同一條,不得各寫一次", (a) => {
    const html = readHtml();
    a.match(html, /EG\.offBand\(w,tg\)/, "網頁必須改叫引擎");
    a.match(html, /EG\.targetWeight\(i,tc,INST\)/, "目標權重同理");
    a.ok(!/Math\.abs\(w-tg\)>P\.DRIFT\*tg/.test(html), "舊的重複實作必須移除");
    a.ok(!/\(1-tc\)\*i\.tgt\/INV\(\)/.test(html), "目標權重公式不得在網頁裡再寫一次");
  });

  it("自動分配與再平衡用同一條最小交易門檻", (a) => {
    const html = readHtml();
    a.ok(!/capTWD\*0\.002/.test(html), "裸數字 0.002 必須移除(引擎是 " + P.MIN_TRADE_FRACTION + ")");
    a.match(html, /capTWD\*P\.MIN_TRADE_FRACTION/, "改讀 PARAMS");
    /* 低於門檻時必須連持倉紀錄一起不動。原本仍把目標股數寫進 units,
       等於悄悄改紀錄卻不叫你下單,紀錄從此與券商實際部位不符。 */
    a.match(html, /\)sh=cur;/, "低於門檻要把目標股數退回現況,不能只是不顯示訂單");
  });
});

describe("防線 · 00653L 扳機門檻只能有一份", () => {
  it("由原始油價與匯率獨立重算", (a) => {
    const t = (brent, usdinr) => E.tripwireArmed({ tripwire: { brent, usdinr } });
    a.strictEqual(t(92, 97), true);
    a.strictEqual(t(92, 95), false, "只有一個條件成立不算觸發");
    a.strictEqual(t(89, 97), false);
    a.strictEqual(t(P.TRIP_BRENT, P.TRIP_USDINR), false, "剛好等於門檻不算觸發(規格是嚴格大於)");
  });

  it("資料不足時回傳 null,不可當成「沒有觸發」", (a) => {
    /* 與 validateSignal 同一種 fail-closed:缺資料不等於安全。 */
    a.strictEqual(E.tripwireArmed({}), null);
    a.strictEqual(E.tripwireArmed({ tripwire: { brent: null, usdinr: 97 } }), null);
    a.strictEqual(E.tripwireArmed({ tripwire: { brent: "", usdinr: 97 } }), null);
  });

  it("網頁與契約測試都不得再寫死 90 / 96", (a) => {
    const html = readHtml();
    a.ok(!/Brent>90/.test(html), "網頁文字必須改讀 PARAMS");
    a.match(html, /P\.TRIP_BRENT/, "網頁必須讀 PARAMS");
    const ct = FS.readFileSync(PATH.join(__dirname, "..", "test", "contract.test.js"), "utf8");
    a.match(ct, /E\.tripwireArmed\(sig\)/, "契約測試必須用引擎重算複核 Worker,不是自己再寫一次門檻");
  });
});

/* ─────────────────────────────────────────────────────────────────
   7. 網頁狀態的三個小洞(刪標的、換資料源、離線)
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 網頁狀態", () => {
  it("刪除標的必須一起刪掉持股", (a) => {
    /* 畫面是用 S.units[id]||0 畫的,殘留值會在同一代碼加回來時原封不動復活,
       而且會跟著匯出檔走——使用者看到自己沒輸入的股數,照著下單就錯了。 */
    const html = readHtml();
    a.match(html, /delete S\.units\[gone\.id\]/, "刪除處必須清掉持股");
    const del = html.slice(html.indexOf("[data-del]"));
    a.ok(del.indexOf("delete S.units") < del.indexOf("INST.splice"),
      "要在 splice 之前取出代碼,否則拿不到被刪的是哪一檔");
  });

  it("匯入換掉 worker 位址必須明示確認", (a) => {
    /* 誰控制 worker 就控制 risk_flag——可以讓配置台在崩盤中顯示「正常期」。
       匯出匯入被當成備份功能,使用者不會預期它能改資料源。 */
    const html = readHtml();
    const imp = html.slice(html.indexOf("impFile\").onchange"));
    a.match(imp, /o\.worker&&o\.worker!==S\.worker&&!confirm\(/, "資料源變更必須 confirm");
    a.ok(imp.indexOf("confirm(") < imp.indexOf("localStorage.setItem"),
      "確認必須在寫入之前");
  });

  it("離線與部署壞掉必須分得出來", (a) => {
    /* 沒有 service worker,離線開啟必然載不到 engine.js。不分辨的話
       使用者在捷運上看到紅色停機畫面,會以為線上版掛了。 */
    const html = readHtml();
    const guard = html.slice(html.indexOf("if(!window.ETFEngine)"));
    a.match(guard.slice(0, 900), /navigator\.onLine/, "必須先看連線狀態");
    a.match(guard.slice(0, 900), /目前離線/, "離線要有自己的說法");
  });
});

/* ─────────────────────────────────────────────────────────────────
   8. 回測資料不該住在呈現層
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 回測資料與網頁解耦", () => {
  it("D_RETS 已搬出 index.html", (a) => {
    const html = readHtml();
    a.ok(!/const D_RETS=\[/.test(html), "432 筆資料不得內嵌在網頁裡");
    a.match(html, /fetch\("data\/d_rets\.json"/, "改成按下按鈕才抓");
  });

  it("data/d_rets.json 可直接讀,不需要正規表示式", (a) => {
    const R = JSON.parse(FS.readFileSync(PATH.join(__dirname, "..", "data", "d_rets.json"), "utf8"));
    a.ok(Array.isArray(R) && R.length === 432, "應為 432 筆陣列,得到 " + R.length);
    a.ok(R.every(Number.isFinite), "不得有 NaN");
  });

  it("載不到時要說話,不可讓 Monte Carlo 爆掉", (a) => {
    const html = readHtml();
    const mc = html.slice(html.indexOf("btnMC\").onclick"));
    a.match(mc.slice(0, 600), /catch\(e\)\{toast\(/, "抓資料失敗必須 toast,不是丟 undefined 進迴圈");
  });
});

/* ─────────────────────────────────────────────────────────────────
   9. 成本、損益、加碼、券商貼上 — 全部直接碰錢
   ───────────────────────────────────────────────────────────────── */

describe("防線 · 成本與未實現損益", () => {
  const cost = { A: 9000, B: 2800 };
  const units = { A: 100, B: 10 };

  it("算得出來就算,算不出來回報 null 而不是 0", (a) => {
    /* 成本未知時回 0 會讓損益等於市值,畫面上看起來像賺了一整個部位 */
    const got = E.pnlOf(INST[0], units, cost, PRICES, 32.6);
    a.strictEqual(got.cost, 9000);
    a.strictEqual(got.value, 10000);
    a.strictEqual(got.pnl, 1000);
    const none = E.pnlOf(INST[0], units, {}, PRICES, 32.6);
    a.strictEqual(none.cost, null, "不知道就說不知道");
    a.strictEqual(none.pnl, null);
    a.strictEqual(none.pct, null);
  });

  it("報價缺失時損益也不可編", (a) => {
    const got = E.pnlOf(INST[0], units, cost, {}, 32.6);
    a.strictEqual(got.value, null);
    a.strictEqual(got.pnl, null);
  });

  it("總計只加總成本已知的,並數出有幾檔沒算進去", (a) => {
    const ctx = { inst: INST, units: units, cost: { A: 9000 }, prices: PRICES, fx: 32.6 };
    const t = E.pnlTotal(ctx);
    a.strictEqual(t.cost, 9000, "B 的成本未知,不可併進分母");
    a.strictEqual(t.value, 10000);
    a.strictEqual(t.missing, 1, "要講出有一檔沒算到");
  });

  it("持倉頁確實顯示未計入的檔數", (a) => {
    const html = readHtml();
    a.match(html, /EG\.pnlOf\(i,S\.units,S\.cost,Q\.px,Q\.fx\)/, "每一檔要走引擎");
    a.match(html, /tot\.missing\?/, "成本未知的檔數必須說出來,不可悄悄少算");
  });
});

describe("防線 · 成本要跟著計畫走", () => {
  const ctx = { inst: INST, prices: PRICES, fx: 32.6 };

  it("買進把成交金額加進成本", (a) => {
    a.deepStrictEqual(E.costAfter({ A: 9000 }, { A: 100 }, { units: { A: 150 } }, ctx), { A: 14000 });
  });

  it("賣出按比例扣,剩下的平均成本不變", (a) => {
    const after = E.costAfter({ A: 9000 }, { A: 100 }, { units: { A: 40 } }, ctx);
    a.strictEqual(after.A, 3600);
    a.strictEqual(after.A / 40, 9000 / 100, "平均成本不因賣出而改變");
  });

  it("從 0 股買進:成本就是這次的成交金額", (a) => {
    a.deepStrictEqual(E.costAfter({}, {}, { units: { A: 80 } }, ctx), { A: 8000 });
  });

  it("本來就不知道成本的,買賣一次不會讓它變成已知", (a) => {
    /* 用現價倒推會編出一個假成本,下個月的損益就是錯的 */
    a.deepStrictEqual(E.costAfter({}, { A: 10 }, { units: { A: 80 } }, ctx), { A: null });
  });

  it("報價缺失時不可硬算", (a) => {
    a.deepStrictEqual(E.costAfter({ A: 9000 }, { A: 10 }, { units: { A: 80 } },
      { inst: INST, prices: {}, fx: 32.6 }), { A: null });
  });

  it("一鍵套用確實維護成本", (a) => {
    const html = readHtml();
    a.match(html, /EG\.costAfter\(S\.cost,S\.units,plan,engCtx\(\)\)/, "套用時必須更新成本");
    const apply = html.slice(html.indexOf("async function applyPlan"));
    a.ok(apply.indexOf("EG.costAfter") < apply.indexOf("S.units[k]=plan.units[k]"),
      "要先用舊持股算成本,寫完新持股就算不出來了");
  });
});

describe("防線 · 加碼分配", () => {
  const ctx = {
    inst: INST, units: { A: 100, B: 10 }, cost: {}, prem: {},
    prices: PRICES, fx: 32.6, cashTWD: 5000, cashUSD: 0
  };
  const state = (over) => Object.assign(
    E.computeState(ctx, { peak: 0, tierTc: P.BASE, signal: okSignal() }), over || {});

  it("只買不賣", (a) => {
    const r = E.allocateCash(ctx, 100000, state());
    a.strictEqual(r.kind, "add");
    a.ok(r.orders.length > 0);
    a.ok(r.orders.every(o => o.side === "buy"), "加碼不可產生賣單——重配是 makePlan 的事");
  });

  it("錢配到最缺的那幾檔,比例就是缺口比例", (a) => {
    const r = E.allocateCash(ctx, 100000, state());
    const sum = r.orders.reduce((s, o) => s + o.share, 0);
    a.ok(sum > 0.99 && sum <= 1.0001, "缺口占比合計應為 1:" + sum);
    const a0 = r.orders.find(o => o.id === "A");
    a.ok(a0 && a0.share > 0.5, "A 的目標權重較高、現值較低,應拿到較多");
  });

  it("投入金額加剩餘等於加碼金額", (a) => {
    const r = E.allocateCash(ctx, 100000, state());
    a.ok(Math.abs(r.spend + r.left - 100000) < 1, "錢不可憑空多出或消失");
  });

  it("風險期不配——規格是凍結投入,新錢也是投入", (a) => {
    const r = E.allocateCash(ctx, 100000, state({ risk: true }));
    a.strictEqual(r.kind, "hold");
    a.match(r.message, /凍結投入/);
  });

  it("加碼後現金仍低於目標水位就全部留現金", (a) => {
    /* 這筆錢的用途是把現金補回水位,不是買股 */
    const poor = Object.assign({}, ctx, { cashTWD: 0 });
    const st = E.computeState(poor, { peak: 0, tierTc: P.DEF, signal: okSignal() });
    const r = E.allocateCash(poor, 100, st);
    a.strictEqual(r.kind, "hold");
    a.match(r.message, /低於目標水位/);
  });

  it("權重全為 0 不可往下算", (a) => {
    const zero = Object.assign({}, ctx, { inst: INST.map(i => Object.assign({}, i, { tgt: 0 })) });
    a.match(E.allocateCash(zero, 100000, state()).message, /權重合計為 0/);
  });

  it("金額太小分不到最小交易門檻就說清楚,不產生碎單", (a) => {
    const r = E.allocateCash(ctx, 60, state());
    a.strictEqual(r.kind, "hold", "得到:" + JSON.stringify(r));
  });

  it("沒填金額不可當成 0 元加碼", (a) => {
    a.match(E.allocateCash(ctx, 0, state()).message, /填入/);
    a.match(E.allocateCash(ctx, -5, state()).message, /填入/);
  });

  it("已經超過目標權重的那一檔,一塊錢都不給", (a) => {
    /* 缺口為負的不可納入分母:納入會讓分母變小,其他檔分到超過自己的缺口,
       等於用加碼去追一個它本來就不該追的權重。賣出是 makePlan 的事。 */
    const over = Object.assign({}, ctx, { units: { A: 100, B: 200 } });
    const st = E.computeState(over, { peak: 0, tierTc: P.BASE, signal: okSignal() });
    const r = E.allocateCash(over, 100000, st);
    a.strictEqual(r.kind, "add");
    a.ok(!r.orders.some(o => o.id === "B"), "B 已超重,不該出現在加碼清單:"
      + r.orders.map(o => o.id).join(","));
    const sum = r.orders.reduce((s, o) => s + o.share, 0);
    a.ok(sum <= 1.0001, "缺口占比合計不可超過 1,得到 " + sum);
  });

  it("分到某一檔的錢買得起一股、卻低於最小交易門檻時,不下那一筆", (a) => {
    /* 整股買得起不代表值得買:一筆低於總值 0.5% 的單只是付手續費 */
    const rich = Object.assign({}, ctx, { units: { A: 100, B: 70 }, cashTWD: 20000 });
    const st = E.computeState(rich, { peak: 0, tierTc: P.BASE, signal: okSignal() });
    const r = E.allocateCash(rich, 150, st);
    a.strictEqual(r.kind, "hold", "得到:" + JSON.stringify(r));
    a.match(r.message, /最小交易門檻/);
  });

  it("沒有報價時,引擎分不出「已達標」與「抓不到價」", (a) => {
    /* 這就是呼叫端必須先過閘門的理由:缺口全算不出來,訊息會變成「不用買」 */
    const noPx = Object.assign({}, ctx, { prices: {} });
    const st = E.computeState(noPx, { peak: 0, tierTc: P.BASE, signal: okSignal() });
    const r = E.allocateCash(noPx, 100000, st);
    a.strictEqual(r.kind, "hold");
    a.match(r.message, /已達到或超過/, "得到:" + r.message);
  });

  it("持倉頁確實接上了,而且先過閘門才分配", (a) => {
    const html = readHtml();
    a.match(html, /EG\.allocateCash\(engCtx\(\),add,st\)/, "寫好沒接上,測試照樣全綠");
    const add = html.slice(html.indexOf('$("btnAdd").onclick'), html.indexOf('$("btnMC").onclick'));
    a.match(add, /await fetchAll\(\)/, "報價缺失時要先補抓,否則核對不了");
    a.match(add, /EG\.gateReasons\(engCtx\(\),Q\.sig,today\)/, "加碼前必須跑閘門");
    a.ok(add.indexOf("EG.gateReasons") < add.indexOf("EG.allocateCash"),
      "閘門要在分配之前——訊號無效時 st.risk 是 undefined,風險閘門等於不存在");
  });

  it("加碼結果會過期:每次重繪都要清掉", (a) => {
    /* 持倉一變,上一次算出來的分配就是錯的,留在畫面上會被當成還有效 */
    const html = readHtml();
    const r = html.slice(html.indexOf("function render(mutate)"), html.indexOf("const s=Q.sig||{}"));
    a.match(r, /\$\("addOut"\)\.innerHTML=""/, "render 開頭必須清掉上一次的加碼建議");
  });
});

describe("防線 · 券商庫存貼上", () => {
  /* 真實券商庫存畫面的文字:名稱那一行是股數與損益,代碼那一行是市值與損益率 */
  const B_INST = [
    { id: "00631L", name: "元大台灣50正2", tgt: 0.10, src: "tw", pocket: "core" },
    { id: "00670L", name: "富邦NASDAQ正2", tgt: 0.30, src: "tw", pocket: "core" }
  ];
  const B_PX = { "00631L": 33.75, "00670L": 184.40 };
  const PASTE = [
    "全部庫存",
    "股票名稱/類別 股數/市值 損益/損益率",
    "元大台灣50正2 2,000 -627",
    "現股 00631L 67,500 -0.93%",
    "富邦NASDAQ正2 500 -7,016",
    "現股 00670L 92,200 -7.07%",
    "某某生技 300 674",
    "現股 00897 12,345 0.23%"
  ].join("\n");
  const by = (t) => {
    const o = {};
    E.parseBrokerPaste(t, B_INST, B_PX, 32.6).rows.forEach(x => { o[x.id] = x; });
    return o;
  };

  it("認出股數與市值,並由損益率回推成本", (a) => {
    const r = by(PASTE);
    a.strictEqual(r["00631L"].units, 2000);
    a.strictEqual(r["00631L"].value, 67500);
    a.strictEqual(r["00631L"].cost, Math.round(67500 / (1 - 0.0093)));
    a.strictEqual(r["00631L"].sure, true, "股數 × 現價 ≈ 市值,對得上");
    a.strictEqual(r["00670L"].units, 500);
    a.strictEqual(r["00670L"].value, 92200);
  });

  it("回推的成本與「市值 − 損益」相差不到千分之一", (a) => {
    /* 損益率是四捨五入後的,所以不會完全相等;差太多就代表認錯欄位了 */
    const r = by(PASTE);
    const direct = 67500 + 627;
    a.ok(Math.abs(r["00631L"].cost - direct) / direct < 0.001,
      r["00631L"].cost + " vs " + direct);
  });

  it("對不上「股數 × 現價 ≈ 市值」就標成不確定", (a) => {
    const r = E.parseBrokerPaste(PASTE, B_INST, {}, 32.6);
    a.ok(r.rows.every(x => x.sure === false), "沒有報價就不該說自己確定");
  });

  it("股數抓錯時不可宣稱確定", (a) => {
    const bad = "元大台灣50正2 99,999 -1\n現股 00631L 67,500 -0.93%";
    a.strictEqual(by(bad)["00631L"].sure, false, "99,999 × 33.75 與市值 67,500 差太遠");
  });

  it("代碼必須是完整的一個 token", (a) => {
    /* 指名 00631L 不可以被 X00631LY 這種字串釣走 */
    const r = E.parseBrokerPaste("X00631LY 1 1", B_INST, B_PX, 32.6);
    a.deepStrictEqual(r.rows, []);
  });

  it("講出設定頁沒有的代碼——那是漏記的持股", (a) => {
    const r = E.parseBrokerPaste(PASTE, B_INST, B_PX, 32.6);
    a.ok(r.unknown.indexOf("00897") >= 0, "得到:" + r.unknown.join(","));
  });

  it("文字裡沒有任何已設定的代碼就回空清單,不可亂猜", (a) => {
    a.deepStrictEqual(E.parseBrokerPaste("今天天氣很好 1,234 5,678", B_INST, B_PX, 32.6).rows, []);
  });

  it("空字串與 null 不可爆掉", (a) => {
    a.deepStrictEqual(E.parseBrokerPaste("", B_INST, B_PX, 32.6).rows, []);
    a.deepStrictEqual(E.parseBrokerPaste(null, B_INST, B_PX, 32.6).rows, []);
  });

  it("解析結果必須先確認才寫入", (a) => {
    const html = readHtml();
    a.match(html, /EG\.parseBrokerPaste\(\$\("pasteBox"\)\.value,INST,Q\.px,Q\.fx\)/);
    /* 解析那一段只能讀 S.units 來顯示「目前股數」,不可以指派 */
    const parse = html.slice(html.indexOf('$("btnParse").onclick'),
                             html.indexOf("async function applyParsed"));
    a.ok(!/S\.(units|cost)\[[^\]]*\]\s*=/.test(parse), "解析階段不可寫入持股或成本");
    a.ok(!/save\(\)/.test(parse), "解析階段不可存檔");
    a.match(html, /btnPasteApply/, "必須有一個明確的套用按鈕");
  });

  it("套用時把股數夾成非負整數", (a) => {
    const apply = readHtml().slice(readHtml().indexOf("async function applyParsed"));
    a.match(apply, /Math\.max\(0,Math\.floor\(x\.units\)\)/, "貼上的文字是不信任輸入");
  });
});

describe("防線 · 券商庫存貼截圖", () => {
  const ocr = () => {
    const html = readHtml();
    return html.slice(html.indexOf("async function handleImage"),
      html.indexOf("async function applyParsed"));
  };

  it("OCR 只是輸入管道:辨識完要走原本那條解析", (a) => {
    /* 另寫一條解析就會繞過「股數 × 現價 ≈ 市值」,那是這個功能唯一的保險 */
    const h = ocr();
    a.match(h, /\$\("btnParse"\)\.onclick\(\)/, "辨識完必須呼叫原本的解析");
    a.ok(!/S\.units\[/.test(h), "辨識階段不可寫入持股");
    a.ok(!/\bsave\(\)/.test(h), "辨識階段不可存檔");
    a.ok(!/parseBrokerPaste/.test(h), "不可自己再解析一次,要共用同一條");
  });

  it("CDN 位址必須釘死版本", (a) => {
    /* @7 或 @latest 會讓上游改版無聲改掉辨識結果,而使用者照著下單 */
    const m = /tesseract\.js@([^/"']+)\//.exec(readHtml());
    a.ok(m, "找不到 tesseract 的 CDN 位址");
    a.match(m[1], /^\d+\.\d+\.\d+$/, "版本沒釘死,得到:" + m[1]);
  });

  it("辨識失敗要給一條走得通的退路", (a) => {
    const h = ocr();
    a.match(h, /截圖辨識失敗/, "要講出失敗");
    a.match(h, /照片|Google 相簿/, "手機內建的辨識比網頁版準,失敗時要說");
  });

  it("深色底要反相,否則辨識率幾乎歸零", (a) => {
    const h = readHtml().slice(readHtml().indexOf("async function prepImage"));
    a.match(h.slice(0, 900), /255-p\[i\]/, "券商 App 是深色底白字,Tesseract 期待淺底深字");
  });

  it("OCR 專屬的代碼修補不可進解析本身", (a) => {
    /* 打字打錯的 006471 不該被悄悄改成 00647L——那會讓錯的錢進錯的檔。
       代碼要用真實長度:fixOcrCodes 不處理三個字元以下的代碼,
       用共用的 INST(代碼是 A / B)會讓這題測不到任何東西。 */
    const inst = [{ id: "00647L", name: "x", tgt: 1, src: "tw", pocket: "core" }];
    const px = { "00647L": 137.6 };
    const txt = "某某正2 300 1,204\n現股 006471 41,280 3.00%";
    a.deepStrictEqual(E.parseBrokerPaste(txt, inst, px, 32.6).rows, [],
      "parseBrokerPaste 不可自己做 OCR 修補");
    /* 先過修補就認得出來——證明上面那個空陣列是少了修補,不是別的原因 */
    const fixed = E.fixOcrCodes(txt, inst);
    a.strictEqual(E.parseBrokerPaste(fixed, inst, px, 32.6).rows.length, 1,
      "修補後應該認得出來:" + fixed);
  });

  it("空白的框不可回報成「找不到代碼」", (a) => {
    /* 貼圖片進 textarea 不會留下任何文字,原本那句在回答一段空字串 */
    const html = readHtml();
    const p = html.slice(html.indexOf('$("btnParse").onclick'));
    a.match(p.slice(0, 600), /pasteBox"\)\.value\.trim\(\)/, "按解析前要先看框裡有沒有東西");
    a.ok(p.slice(0, 600).indexOf('value.trim()') < p.slice(0, 600).indexOf("fetchAll"),
      "空的就不該去抓報價");
  });
});

describe("防線 · 目標權重的實際佔比", () => {
  /* 輸入框裡是相對權重,實際佔比要除以總和再扣現金。這兩步使用者看不到,
     而它決定每個月的下單張數——填 30 可能是 28.2%,也可能是 60%。 */
  const wsum = () => {
    const html = readHtml();
    return html.slice(html.indexOf("function renderWeights"), html.indexOf("function initUI"));
  };

  it("佔比必須走引擎的 targetWeight,不可在網頁自己算一次", (a) => {
    const h = wsum();
    a.match(h, /EG\.targetWeight\(i,P\.BASE,INST\)/, "要用引擎那一份");
    a.ok(!/weightSum\(|\/INV\(\)/.test(h), "不可自己再除一次總和");
    a.ok(!/0\.8|\*80/.test(h), "不可把 1-現金 寫成裸數字");
  });

  it("權重合計為 0 時說清楚,不可印出 NaN", (a) => {
    /* targetWeight 的分母是 weightSum,為 0 時每一格都會是 NaN% */
    const h = wsum();
    a.match(h, /INV\(\)>0/, "算之前要先擋");
    a.match(h, /合計為 0/, "要說出為什麼算不出來");
  });

  it("空白標的列不計入,也不顯示", (a) => {
    /* 空白列若被算進分母,真實標的會被等比稀釋 */
    const inst = [{ id: "00631L", tgt: 0.3 }, { id: "", tgt: 0.7 }];
    a.strictEqual(E.weightSum(inst), 0.3, "空白列不可進分母");
    a.strictEqual(E.live(inst).length, 1);
    a.match(wsum(), /LIVE\(\)/, "顯示也只走有效標的");
  });

  it("改權重時只更新佔比,不可重建整張表", (a) => {
    /* change 是失焦才觸發,整區重建會把使用者剛 tab 進去的下一格摧毀 */
    const html = readHtml();
    const h = html.slice(html.indexOf('$("instBox").querySelectorAll("[data-if]")'));
    const seg = h.slice(0, 900);
    a.match(seg, /renderWeights\(\)/, "要更新佔比");
    a.ok(!/initUI\(\)/.test(seg), "不可在這裡重建 instBox");
  });
});

describe("防線 · 一句話結論", () => {
  /* 這一頁每個月只回答一個問題:「要不要動、動什麼」。
     結論必須來自引擎的 plan.kind,不可由網頁自己重新判斷一次。 */
  const run = () => {
    const html = readHtml();
    return html.slice(html.indexOf("async function runCheck"), html.indexOf('$("btnCheck").onclick'));
  };

  it("結論分得出減碼與再平衡,而且是讀引擎的 kind", (a) => {
    const h = run();
    a.match(h, /plan\.kind==="trim"/, "減碼與再平衡的措辭不同,判斷要讀引擎");
    a.match(readHtml(), /kind:plan\.kind,/, "makePlan 必須把 kind 帶出來");
    a.ok(!/st\.risk\?"風險期/.test(h), "不可在網頁自己重判一次風險期");
  });

  it("閘門沒過時必須講出「不下單」,不可只列原因", (a) => {
    /* 原本只在清單裡列五道閘門,使用者得自己讀完才知道這個月沒有建議 */
    const h = run();
    const g = h.slice(h.indexOf("if(blockers.length)"));
    a.match(g.slice(0, 400), /setVerdict\("本月不下單"/, "閘門擋下也要給結論");
  });

  it("訂單清單不再重複抬頭——抬頭已經是結論那一句", (a) => {
    const h = run();
    a.ok(!/"<div class='sug "\+\(plan\.headSide/.test(h),
      "抬頭列已經搬進結論,清單裡不可再印一次");
  });

  it("第一次打開要告訴人下一步做什麼", (a) => {
    /* 小白看到一堆 0 不知道要幹嘛;結論卡必須指出去哪裡填資料 */
    const html = readHtml();
    const boot = html.slice(html.indexOf("(async function()"));
    a.match(boot, /setVerdict\("還沒有持股"/, "沒有持股時要給明確的下一步");
  });
});

describe("防線 · 設定頁沒有的代碼", () => {
  /* 講不出來的後果不只是少一列:總值、權重、再平衡訂單全都建立在
     不完整的組合上,而畫面上沒有任何線索。 */
  const inst = [
    { id: "00631L", name: "a", tgt: 0.3, src: "tw", pocket: "core" },
    { id: "00670L", name: "b", tgt: 0.3, src: "tw", pocket: "core" },
  ];
  const px = { "00631L": 33.83, "00670L": 198.4 };
  const un = (t) => E.parseBrokerPaste(t, inst, px, 32.6).unknown;

  it("六位數的代碼也要講出來", (a) => {
    /* 006208 富邦台50 是六位數,原本的 \d{4,5} 完全抓不到,整檔無聲消失 */
    a.deepStrictEqual(un("現股 006208 50,000 1.2%"), ["006208"]);
  });

  it("四位數與五位數一樣要講", (a) => {
    a.deepStrictEqual(un("現股 0050 50,000 1.2%"), ["0050"]);
    a.deepStrictEqual(un("現股 00897 12,345 0.23%"), ["00897"]);
    a.deepStrictEqual(un("現股 00988A 50,000 1.2%"), ["00988A"]);
  });

  it("股數與市值不可被當成代碼", (a) => {
    /* 假警報會讓人學會忽略這條訊息,等於沒有這條訊息。
       逗號被 OCR 吃掉時,2000 / 67500 / 3258 全是純數字。 */
    a.deepStrictEqual(un("某某正2 2000 -627\n現股 00631L 67500 -0.93%"), []);
    a.deepStrictEqual(un("某某正2 10246 -3258\n現股 00631L 345783 -0.93%"), []);
  });

  it("已經設定的代碼不可出現在清單裡,大小寫視為同一檔", (a) => {
    a.deepStrictEqual(un("現股 00631L 67,500 -0.93%\n現股 00670L 92,200 -7.07%"), []);
    a.deepStrictEqual(un("現股 00631l 67,500 -0.93%"), [], "大小寫不同不是另一檔");
  });

  it("同一個代碼出現多次只講一次", (a) => {
    a.deepStrictEqual(un("00897 x 00897 y 00897"), ["00897"]);
  });

  it("沒設定的代碼,字尾是小寫也要講出來", (a) => {
    /* OCR 常把 L 認成小寫 l。只認大寫的話這一檔會無聲消失——
       拿「已設定」的代碼測這件事是假的,匹配不到也是空陣列。 */
    a.deepStrictEqual(un("現股 00733l 50,000 1.2%"), ["00733l"]);
  });

  it("設定頁把代碼打成小寫,仍算同一檔", (a) => {
    /* 比對不忽略大小寫的話,會把自己設定過的持股報成「設定頁沒有的代碼」。
       設定頁的代碼必須是小寫,否則忽不忽略大小寫的結果一樣,等於沒測到。 */
    const low = [{ id: "00631l", name: "a", tgt: 0.3, src: "tw", pocket: "core" }];
    a.deepStrictEqual(
      E.parseBrokerPaste("現股 00631L 67,500 -0.93%", low, {}, 32.6).unknown, []);
  });

  it("已知的漏網:0 開頭以外的代碼認不出來", (a) => {
    /* 2330 與四位數的數量在形狀上無從分辨。寧可漏講也不要亂報——
       這是刻意的取捨,不是忘了處理。 */
    a.deepStrictEqual(un("現股 2330 500,000 1.2%"), []);
  });
});

describe("防線 · OCR 代碼修補", () => {
  /* 這一條在決定「這一列的錢屬於哪一檔」,所以規則刻意很窄 */
  const inst = [{ id: "00631L" }, { id: "00670L" }, { id: "00647L" }, { id: "00897" }];
  const f = (x) => E.fixOcrCodes(x, inst);

  it("差一個易混字元就修回設定頁裡的代碼", (a) => {
    /* 實測:Tesseract 把 00647L 認成 006471,那一列會整個無聲消失 */
    a.strictEqual(f("IRA 006471 41,280"), "IRA 00647L 41,280");
    a.strictEqual(f("xx 0063lL 67,500"), "xx 00631L 67,500", "互混是雙向的:l 也可能是 1");
    a.strictEqual(f("xx 0067OL 92,200"), "xx 00670L 92,200", "字母 O 與數字 0");
  });

  it("只准差一個字元", (a) => {
    a.strictEqual(f("O0647l 1"), "O0647l 1", "差兩個就不是辨識雜訊,是別的東西");
  });

  it("那個字元必須真的易混", (a) => {
    a.strictEqual(f("00647X 1"), "00647X 1");
  });

  it("長度不同不修", (a) => {
    a.strictEqual(f("0064 1"), "0064 1");
    a.strictEqual(f("006471L 1"), "006471L 1");
  });

  it("兩個代碼都只差一個字元時寧可不改", (a) => {
    /* 改錯一檔等於把錢算到別的標的上,無從選擇時不要猜。
       0063IL 對 00631L 與 0063lL 各只差一個同群組字元,兩邊都像。 */
    const two = [{ id: "00631L" }, { id: "0063lL" }];
    a.strictEqual(E.fixOcrCodes("xx 0063IL 1", two), "xx 0063IL 1");
    /* 先證明單獨一個的時候確實會修,否則上面那行可能只是碰巧沒命中 */
    a.strictEqual(E.fixOcrCodes("xx 0063IL 1", [{ id: "00631L" }]), "xx 00631L 1");
  });

  it("設定頁沒有的代碼原樣留著——那是漏記的持股,要被講出來", (a) => {
    a.strictEqual(f("現股 00888 12,345"), "現股 00888 12,345");
  });

  it("純數字不會被當成代碼改掉", (a) => {
    a.strictEqual(f("2,000 -627 41280 12345"), "2,000 -627 41280 12345");
  });

  it("空字串、null、沒有標的都不可爆掉", (a) => {
    a.strictEqual(f(""), "");
    a.strictEqual(f(null), "");
    a.strictEqual(E.fixOcrCodes("abc", []), "abc");
    a.strictEqual(E.fixOcrCodes("abc", null), "abc");
  });

  it("網頁只在 OCR 之後叫它,而且要在解析之前", (a) => {
    const html = readHtml();
    const h = html.slice(html.indexOf("async function handleImage"),
      html.indexOf("async function applyParsed"));
    a.match(h, /EG\.fixOcrCodes\(text,INST\)/, "網頁必須改叫引擎,不可自己再寫一份");
    a.ok(h.indexOf("EG.fixOcrCodes") < h.indexOf('$("btnParse").onclick()'),
      "要先修代碼再解析,否則那一列已經被丟掉了");
  });
});

describe("防線 · 成本是狀態的一部分", () => {
  it("匯入驗證認得 cost,負數要擋", (a) => {
    a.strictEqual(E.validateImport({ cost: { A: 1000 } }), null);
    a.strictEqual(E.validateImport({ cost: { A: null } }), null, "null 代表成本未知,是合法的");
    a.match(E.validateImport({ cost: { A: -1 } }), /成本/);
    a.match(E.validateImport({ cost: [] }), /cost/);
  });

  it("改完持有數必須重畫,否則持倉頁停在舊數字", (a) => {
    const html = readHtml();
    const h = html.slice(html.indexOf('document.addEventListener("change"'));
    a.match(h.slice(0, 400), /readUI\(\);/, "仍要存檔");
    a.match(h.slice(0, 400), /render\(false\);/, "也要重畫");
  });

  it("刪標的時成本一起刪", (a) => {
    const html = readHtml();
    a.match(html, /delete S\.units\[gone\.id\];delete S\.cost\[gone\.id\]/,
      "殘留成本會在同一代碼加回來時配上新的股數,算出假的損益");
  });
});

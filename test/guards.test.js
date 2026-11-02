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

/**
 * 資料契約測試:驗證 Worker 五個端點的回應結構。
 *
 * 這組測試會實際連網。目的不是驗證數值對錯(那是上游的事),
 * 而是「上游 Yahoo / TWSE 改格式時立刻知道」——
 * 欄位還在不在、型別對不對、數值落在合理範圍。
 *
 *   node test/run.js --contract
 */
"use strict";
const { describe, it } = require("./harness.js");
const E = require("../engine/engine.js");

const WORKER = process.env.ETF_WORKER
  || "https://green-term-c0ddetf2x-worker.marschannewtag.workers.dev";
const TIMEOUT = 20000;

async function get(path) {
  const r = await fetch(WORKER + path, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
  return r.json();
}

/** [日期字串, 數值] 形式的序列 */
function assertSeries(a, rows, label) {
  a.ok(Array.isArray(rows), `${label} 應為陣列`);
  a.ok(rows.length > 0, `${label} 不得為空`);
  rows.slice(-5).forEach(row => {
    a.ok(Array.isArray(row) && row.length >= 2, `${label} 每筆應為 [日期, 數值]:${JSON.stringify(row)}`);
    a.strictEqual(typeof row[0], "string", `${label} 日期應為字串`);
    a.ok(Number.isFinite(+row[1]), `${label} 數值無效:${JSON.stringify(row)}`);
  });
}

describe("資料契約 · /signal", () => {
  let sig;
  it("回應可取得且通過引擎驗證", async (a) => {
    sig = await get("/signal");
    a.strictEqual(E.validateSignal(sig), null, "validateSignal 應通過");
  });

  it("必要欄位齊全且型別正確", (a) => {
    a.strictEqual(typeof sig.risk_flag, "boolean", "risk_flag 應為 boolean");
    a.strictEqual(typeof sig.spx.below, "boolean");
    a.strictEqual(typeof sig.vix.above, "boolean");
    a.ok(Number.isFinite(+sig.spx.last) && Number.isFinite(+sig.spx.sma12m));
    a.ok(Number.isFinite(+sig.vix.last));
    a.ok(/^\d{4}-\d{2}-\d{2}$/.test(sig.asof.spx), "asof.spx 應為 YYYY-MM-DD");
  });

  it("數值落在合理範圍(超出即代表上游資料異常)", (a) => {
    a.ok(+sig.spx.last > 500 && +sig.spx.last < 50000, `SPX ${sig.spx.last} 超出合理範圍`);
    a.ok(+sig.spx.sma12m > 500 && +sig.spx.sma12m < 50000, `SPX MA12 ${sig.spx.sma12m} 超出合理範圍`);
    a.ok(+sig.vix.last > 5 && +sig.vix.last < 200, `VIX ${sig.vix.last} 超出合理範圍`);
  });

  it("VIX 門檻與本地參數一致", (a) => {
    if (sig.vix.threshold == null) return; // 舊版 Worker 未回傳門檻
    a.strictEqual(+sig.vix.threshold, E.PARAMS.VIX_THRESHOLD,
      `Worker 的 VIX 門檻 ${sig.vix.threshold} 與 engine.js 的 ${E.PARAMS.VIX_THRESHOLD} 不一致`);
  });

  it("Worker 的 risk_flag 與本地獨立重算一致", (a) => {
    a.strictEqual(E.riskAgrees(sig), true,
      `Worker risk_flag=${sig.risk_flag},本地依 SPX ${sig.spx.last} vs MA ${sig.spx.sma12m} `
      + `與 VIX ${sig.vix.last} 重算為 ${E.derivedRisk(sig)}`);
  });

  it("布林旗標與底層數值自洽", (a) => {
    a.strictEqual(sig.spx.below, +sig.spx.last < +sig.spx.sma12m, "below 與 last/sma12m 不自洽");
    a.strictEqual(sig.vix.above, +sig.vix.last > E.PARAMS.VIX_THRESHOLD, "above 與 last/threshold 不自洽");
  });

  it("資料未過期(超過門檻代表上游停更)", (a) => {
    const today = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
    const d = E.staleDays(sig, today);
    a.ok(d <= E.PARAMS.STALE, `市場資料已延遲 ${d} 天(門檻 ${E.PARAMS.STALE} 天,asof ${sig.asof.spx})`);
  });

  it("00653L 扳機欄位結構正確", (a) => {
    if (!sig.tripwire) return;
    a.ok(Number.isFinite(+sig.tripwire.brent), "brent 應為數值");
    a.ok(Number.isFinite(+sig.tripwire.usdinr), "usdinr 應為數值");
    a.strictEqual(typeof sig.tripwire.armed, "boolean");
    a.ok(+sig.tripwire.brent > 10 && +sig.tripwire.brent < 300, `Brent ${sig.tripwire.brent} 超出合理範圍`);
    a.ok(+sig.tripwire.usdinr > 30 && +sig.tripwire.usdinr < 200, `USDINR ${sig.tripwire.usdinr} 超出合理範圍`);
    a.strictEqual(sig.tripwire.armed, +sig.tripwire.brent > 90 && +sig.tripwire.usdinr > 96,
      "armed 與 Brent>90 且 INR>96 的條件不自洽");
  });
});

describe("資料契約 · /fx", () => {
  it("USD/TWD 結構與範圍正確", async (a) => {
    const fx = await get("/fx");
    a.ok(Array.isArray(fx.last) && fx.last.length >= 2, "last 應為 [日期, 匯率]");
    const rate = +fx.last[1];
    a.ok(Number.isFinite(rate), "匯率應為數值");
    a.ok(rate > 20 && rate < 50, `USD/TWD ${rate} 超出合理範圍`);
    if (fx.history) assertSeries(a, fx.history, "/fx history");
  });
});

describe("資料契約 · /tw 台股報價", () => {
  const IDS = ["00670L", "00647L", "00631L", "00640L", "00988A", "00653L"];
  IDS.forEach(id => {
    it(`${id} 可取得有效報價`, async (a) => {
      const d = await get("/tw?no=" + id);
      a.strictEqual(String(d.stockNo), id, "stockNo 應與請求一致");
      assertSeries(a, d.month_daily, `${id} month_daily`);
      /* PWA 的取價順序:realtime → month_daily 末筆 → /quotes */
      let p = (d.realtime && d.realtime.price != null) ? +d.realtime.price : NaN;
      if (!E.isPos(p)) p = +d.month_daily[d.month_daily.length - 1][1];
      a.ok(E.isPos(p), `${id} 取不到有效價格`);
      a.ok(p < 100000, `${id} 價格 ${p} 異常`);
    });
  });
});

describe("資料契約 · /quotes", () => {
  it("台股 fallback 路徑可用", async (a) => {
    const y = await get("/quotes?symbols=00670L.TW");
    const d = y["00670L.TW"];
    a.ok(d, "回應應以請求的 symbol 為 key");
    a.ok(Array.isArray(d.last) && Number.isFinite(+d.last[1]), "last 應為 [日期, 價格]");
    a.ok(E.isPos(+d.last[1]));
  });

  it("美股標的可取得報價(src=us 路徑)", async (a) => {
    const y = await get("/quotes?symbols=SGOV");
    a.ok(y.SGOV && Number.isFinite(+y.SGOV.last[1]), "SGOV 應可取得報價");
  });

  it("不存在的標的不得回傳看似有效的價格", async (a) => {
    let y;
    try { y = await get("/quotes?symbols=ZZZZNOTREAL"); }
    catch (e) { return; } // 直接回錯誤也是可接受的處理
    const d = y.ZZZZNOTREAL;
    if (d && d.last) a.ok(!E.isPos(+d.last[1]), "不存在的標的不該有正價格");
  });
});

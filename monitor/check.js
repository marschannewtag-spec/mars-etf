#!/usr/bin/env node
/**
 * 每日監控:抓市場資料 → 用共用引擎判斷 → 只在狀態改變時發警報。
 *
 * ## 為什麼不含持倉
 *
 * 這個 repo 是公開的,GitHub Issue 也是全世界可讀。
 * 就算把持倉藏進 Actions secret,警報內容一旦帶金額仍等於公開。
 *
 * 因此監控只處理「市場驅動」的觸發條件——這些也正好是時效性最強的:
 *   風險旗標翻轉、資料斷線/過期、上游格式破損、扳機觸發、Worker 判斷失準。
 *
 * 「權重漂移超帶」與「分層觸發」需要持倉與峰值,留在 PWA 本機計算。
 * 那兩者可以等你下次開 App,前五者不能等。
 *
 * 用法:
 *   node monitor/check.js                 讀 heartbeat、檢查、寫回、輸出結果
 *   node monitor/check.js --dry-run       不寫入 heartbeat
 *   node monitor/check.js --drill         演練:強制發出一則測試通知
 *   ETF_WORKER=https://...                覆寫 Worker 位址
 *
 * 結果會寫入 monitor/result.json 供 workflow 讀取,並印出人類可讀摘要。
 */
"use strict";
const fs = require("fs");
const path = require("path");
const E = require("../engine/engine.js");

const WORKER = process.env.ETF_WORKER
  || "https://green-term-c0ddetf2x-worker.marschannewtag.workers.dev";
const HEARTBEAT = path.join(__dirname, "heartbeat.json");
const RESULT = path.join(__dirname, "result.json");
const DRY = process.argv.includes("--dry-run");
const DRILL = process.argv.includes("--drill");
const TIMEOUT = 20000;

/** 台北時間(UTC+8)的 YYYY-MM-DD HH:mm */
function taipeiNow() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 16).replace("T", " ");
}
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
}

async function get(p) {
  const r = await fetch(WORKER + p, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
  return r.json();
}

/* ── 觀測 ───────────────────────────────────────────────────── */

async function observe() {
  const obs = { at: taipeiNow(), worker: WORKER, ok: false };
  try {
    obs.signal = await get("/signal");
  } catch (e) {
    obs.error = "無法取得 /signal:" + e.message;
    return obs;
  }
  try {
    const fx = await get("/fx");
    obs.fx = (fx && fx.last && Number.isFinite(+fx.last[1])) ? +fx.last[1] : null;
  } catch (e) { obs.fx = null; }
  obs.ok = true;
  return obs;
}

/* ── 判斷 ───────────────────────────────────────────────────── */

/**
 * 比對前次狀態與本次觀測,產生警報清單。純函式,可測試。
 *
 * @param prev 上次的 heartbeat(可為 null)
 * @param obs  observe() 的輸出
 * @param today YYYY-MM-DD(台北)
 * @returns {alerts:[{level,title,detail}], state:{...}}
 */
function evaluate(prev, obs, today) {
  const alerts = [];
  const push = (level, title, detail) => alerts.push({ level, title, detail });

  /* 1. Worker 掛了 */
  if (!obs.ok) {
    push("down", "Worker 無回應", obs.error
      + "\n\n配置台在 Worker 恢復前無法產生任何建議。"
      + "若持續數日,請檢查 Cloudflare Worker 與上游 Yahoo / TWSE。");
    return { alerts, state: prev };  // 拿不到資料,不更新狀態
  }

  const sig = obs.signal;

  /* 2. 訊號結構破損(上游改格式) */
  const sigErr = E.validateSignal(sig);
  if (sigErr) {
    push("contract", "市場訊號結構破損", sigErr
      + "\n\n這通常代表上游 Yahoo / TWSE 改了回應格式。"
      + "配置台已 fail closed,不會產生任何建議。\n\n"
      + "```json\n" + JSON.stringify(sig, null, 1).slice(0, 800) + "\n```");
    return { alerts, state: prev };
  }

  const state = {
    checkedAt: obs.at,
    asof: sig.asof.spx,
    riskFlag: !!sig.risk_flag,
    spxLast: +sig.spx.last,
    spxSma12m: +sig.spx.sma12m,
    spxBelow: !!sig.spx.below,
    vixLast: +sig.vix.last,
    vixAbove: !!sig.vix.above,
    tripwireArmed: !!(sig.tripwire && sig.tripwire.armed),
    brent: sig.tripwire ? +sig.tripwire.brent : null,
    usdinr: sig.tripwire ? +sig.tripwire.usdinr : null,
    fx: obs.fx
  };

  /* 3. 資料過期 */
  const stale = E.staleDays(sig, today);
  if (stale > E.PARAMS.STALE) {
    push("stale", `市場資料過期 ${stale} 天`,
      `最新資料日期 ${sig.asof.spx},已超過 ${E.PARAMS.STALE} 天門檻。\n\n`
      + "配置台會中止月檢並拒絕更新峰值與分層狀態。上游可能停更。");
  }

  /* 4. Worker 的 risk_flag 與本地獨立重算不一致 */
  const derived = E.derivedRisk(sig);
  if (derived !== null && derived !== state.riskFlag) {
    push("mismatch", "⚠ Worker 風險旗標與本地重算不一致",
      `Worker 回報 risk_flag = ${state.riskFlag},`
      + `但依 SPX ${state.spxLast} vs MA12 ${state.spxSma12m}、`
      + `VIX ${state.vixLast} vs 門檻 ${E.PARAMS.VIX_THRESHOLD} 重算應為 ${derived}。\n\n`
      + "**在釐清之前不要依配置台的燈號操作。** "
      + "可能是 Worker 的判斷邏輯與 engine.js 不同步,或上游資料有問題。");
  }

  /* 5. 風險旗標翻轉——最需要立刻知道的一件事 */
  if (prev && prev.riskFlag !== state.riskFlag) {
    if (state.riskFlag) {
      push("risk-on", "🔴 風險期開始 · 凍結投入",
        reasonText(state)
        + "\n\n**依規格,自即刻起:**\n"
        + `- 凍結所有投入,不再平衡\n`
        + `- 現金未達 ${E.PARAMS.DEF * 100}% 者減碼至該水位(單次不超過持股 ${E.PARAMS.CAP * 100}%)\n`
        + `- 已達水位者空手等待旗標熄滅\n\n`
        + "開配置台執行月檢取得實際下單清單。");
    } else {
      push("risk-off", "🟢 風險期結束 · 恢復三層引擎",
        reasonText(state)
        + "\n\n風險旗標熄滅,可恢復再平衡與分層抄底。\n"
        + "開配置台執行月檢取得下單清單。");
    }
  }

  /* 6. 00653L 扳機翻轉 */
  if (prev && prev.tripwireArmed !== state.tripwireArmed && state.brent != null) {
    if (state.tripwireArmed) {
      push("tripwire", "🔶 00653L 扳機觸發",
        `Brent ${state.brent} > 90 且 USD/INR ${state.usdinr} > 96,兩條件同時成立。\n\n`
        + "依規格需於**下次月檢裁決是否出場**。這是質性判斷,不會自動執行。");
    } else {
      push("tripwire-off", "00653L 扳機解除",
        `Brent ${state.brent} · USD/INR ${state.usdinr},已不再同時滿足觸發條件。`);
    }
  }

  /* 7. 匯率取不到(不阻斷,但要知道) */
  if (obs.fx == null) {
    push("fx", "USD/TWD 匯率無法取得",
      "配置台在匯率無效時會中止月檢(美股標的與美元現金無法換算)。");
  }

  return { alerts, state };
}

/**
 * 把資料契約測試的失敗轉成一則警報。
 *
 * 契約測試需連網,放進 CI 會因上游抖動造成與程式碼無關的紅燈,
 * 那種紅燈久了就會被忽略。改在每日監控裡跑,失敗轉為通知。
 *
 * @param log 測試輸出(可能含 ANSI 色碼)
 */
function contractAlert(log) {
  const clean = String(log || "").replace(/\x1b\[[0-9;]*m/g, "");
  const failed = clean.split("\n").filter(l => l.includes("✗")).map(l => l.trim());
  return {
    level: "contract-test",
    title: "上游資料契約檢查失敗",
    detail: "Worker 端點的結構或數值範圍不再符合預期,通常代表上游 Yahoo / TWSE 改了回應格式。\n\n"
      + "**配置台可能因此無法產生建議。** 風險旗標的判斷未必受影響,請以本則通知內的市場狀態為準。\n\n"
      + (failed.length ? "失敗項目:\n" + failed.map(l => "- " + l.replace(/^✗\s*/, "")).join("\n") + "\n\n" : "")
      + "重跑:`node test/run.js --contract`"
  };
}

function reasonText(s) {
  const reasons = [];
  if (s.spxBelow) reasons.push(`SPX ${s.spxLast} 跌破 12 月均線 ${s.spxSma12m}`);
  else reasons.push(`SPX ${s.spxLast} 站上 12 月均線 ${s.spxSma12m}`);
  if (s.vixAbove) reasons.push(`VIX ${s.vixLast} 超過門檻 ${E.PARAMS.VIX_THRESHOLD}`);
  else reasons.push(`VIX ${s.vixLast} 低於門檻 ${E.PARAMS.VIX_THRESHOLD}`);
  return "判定依據:\n- " + reasons.join("\n- ");
}

/* ── 執行 ───────────────────────────────────────────────────── */

async function main() {
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(HEARTBEAT, "utf8")); }
  catch (e) { /* 首次執行 */ }

  const obs = await observe();
  const { alerts, state } = evaluate(prev, obs, taipeiToday());

  /* 契約測試由 workflow 以非致命方式先跑,結果經環境變數帶進來 */
  if (process.env.CONTRACT_FAILED === "1") {
    let log = "";
    try { log = fs.readFileSync(process.env.CONTRACT_LOG || "", "utf8"); } catch (e) { /* 無日誌照樣通知 */ }
    alerts.push(contractAlert(log));
  }

  /* 演練:強制發一則通知,確認 Issue 真的開得起來、手機真的收得到。
     不動心跳,也不假造市場狀態——內容明確標示為演練,不會被誤讀成真警報。 */
  if (DRILL) {
    alerts.push({
      level: "drill",
      title: "🧪 通知管道演練(非真實警報)",
      detail: "這是一次人為觸發的演練,用來確認通知管道暢通。**不代表任何市場事件,不需要任何操作。**\n\n"
        + "看到這則 Issue 代表:\n"
        + "- Actions 排程能執行\n- Worker 抓得到資料\n- Issue 開得起來\n- 通知送得到你手機\n\n"
        + "確認後直接關閉此 Issue 即可。真實警報的標題會是「風險期開始」「Worker 無回應」這類。\n\n"
        + (state
            ? `演練當下的市場狀態:風險旗標 ${state.riskFlag ? "🔴 亮" : "🟢 熄"}`
              + ` · SPX ${state.spxLast} / MA12 ${state.spxSma12m} · VIX ${state.vixLast}`
              + ` · 資料日期 ${state.asof}`
            : "(演練當下無法取得市場資料——這本身就是個問題,請檢查 Worker)")
    });
  }

  const result = {
    at: obs.at,
    firstRun: !prev,
    alerts,
    state,
    /* 首次執行時沒有前次狀態可比,只記錄不發翻轉類警報 */
    shouldNotify: alerts.length > 0
  };

  fs.writeFileSync(RESULT, JSON.stringify(result, null, 2) + "\n");
  /* 演練不可污染心跳:否則演練後的下一次真實檢查會少比對一天 */
  if (!DRY && !DRILL && state) fs.writeFileSync(HEARTBEAT, JSON.stringify(state, null, 2) + "\n");

  /* 人類可讀摘要(Actions log 用) */
  console.log(`[${obs.at}] 監控執行完畢`);
  if (state) {
    console.log(`  風險旗標 ${state.riskFlag ? "🔴 亮" : "🟢 熄"}`
      + ` · SPX ${state.spxLast} / MA12 ${state.spxSma12m}`
      + ` · VIX ${state.vixLast} · 扳機 ${state.tripwireArmed ? "觸發" : "未觸發"}`
      + ` · 資料日期 ${state.asof}`);
  }
  if (!alerts.length) { console.log("  無需通知(靜默)"); return; }
  console.log(`  ⚠ ${alerts.length} 則警報:`);
  alerts.forEach(a => console.log(`    [${a.level}] ${a.title}`));
}

if (require.main === module) {
  main().catch(e => { console.error("監控本身出錯:", e); process.exit(1); });
}

module.exports = { evaluate, reasonText, contractAlert };

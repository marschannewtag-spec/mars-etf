/**
 * 監控判斷邏輯測試。
 *
 * 監控最危險的失效模式不是「誤報」而是「該報沒報」——
 * 風險期開始了卻靜默,你會以為一切正常。
 * 這裡逐條驗證翻轉偵測與去重。
 */
"use strict";
const { describe, it } = require("./harness.js");
const { evaluate } = require("../monitor/check.js");
const E = require("../engine/engine.js");

const TODAY = "2026-08-06";

function sig(over) {
  return Object.assign({
    risk_flag: false,
    spx: { last: 7723, sma12m: 7089, below: false },
    vix: { last: 15.9, above: false },
    asof: { spx: "2026-08-05" },
    tripwire: { brent: 79.5, usdinr: 95.1, armed: false }
  }, over || {});
}
const obs = (s, fx) => ({ at: "2026-08-06 16:00", ok: true, signal: s, fx: fx === undefined ? 32.28 : fx });
const levels = r => r.alerts.map(a => a.level);

describe("監控 · 風險旗標翻轉", () => {
  it("平靜 → 平靜:靜默", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    a.deepStrictEqual(levels(evaluate(prev, obs(sig()), TODAY)), []);
  });

  it("平靜 → 風險:必須發出 risk-on", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const now = sig({ risk_flag: true, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    const r = evaluate(prev, obs(now), TODAY);
    a.ok(levels(r).includes("risk-on"), "風險期開始必須通知");
    const alert = r.alerts.find(x => x.level === "risk-on");
    a.match(alert.title, /風險期開始/);
    a.match(alert.detail, /凍結所有投入/);
    a.match(alert.detail, /5200/, "應說明判定依據");
  });

  it("風險 → 平靜:必須發出 risk-off", (a) => {
    const prevSig = sig({ risk_flag: true, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    const prev = evaluate(null, obs(prevSig), TODAY).state;
    const r = evaluate(prev, obs(sig()), TODAY);
    a.ok(levels(r).includes("risk-off"));
  });

  it("風險 → 風險:不重複通知", (a) => {
    const s = sig({ risk_flag: true, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    const prev = evaluate(null, obs(s), TODAY).state;
    a.deepStrictEqual(levels(evaluate(prev, obs(s), TODAY)), [], "持續風險期應保持靜默");
  });

  it("首次執行不發翻轉警報(沒有前次狀態可比)", (a) => {
    const r = evaluate(null, obs(sig({ risk_flag: true })), TODAY);
    a.ok(!levels(r).includes("risk-on"), "首次執行只建立基準,不發翻轉通知");
    a.strictEqual(r.state.riskFlag, true, "但狀態要記錄下來");
  });
});

describe("監控 · 資料健康", () => {
  it("Worker 無回應 → down,且不更新狀態", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const r = evaluate(prev, { at: "x", ok: false, error: "/signal → HTTP 502" }, TODAY);
    a.deepStrictEqual(levels(r), ["down"]);
    a.strictEqual(r.state, prev, "拿不到資料時不可覆寫上次的良好狀態");
  });

  it("訊號結構破損 → contract,且不更新狀態", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const broken = sig(); delete broken.risk_flag;
    const r = evaluate(prev, obs(broken), TODAY);
    a.deepStrictEqual(levels(r), ["contract"]);
    a.match(r.alerts[0].detail, /risk_flag/);
    a.strictEqual(r.state, prev);
  });

  it("資料過期超過門檻 → stale", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const old = sig({ asof: { spx: "2026-07-20" } });
    a.ok(levels(evaluate(prev, obs(old), TODAY)).includes("stale"));
  });

  it("資料只延遲 1 天 → 不通知", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    a.ok(!levels(evaluate(prev, obs(sig()), TODAY)).includes("stale"));
  });

  it("匯率取不到 → fx 警報", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    a.ok(levels(evaluate(prev, obs(sig(), null), TODAY)).includes("fx"));
  });
});

describe("監控 · Worker 判斷複核", () => {
  it("Worker 說沒事但盤面在崩 → mismatch(最危險的情況)", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const lying = sig({ risk_flag: false, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    const r = evaluate(prev, obs(lying), TODAY);
    a.ok(levels(r).includes("mismatch"), "必須偵測到 Worker 的判斷與本地重算不符");
    a.match(r.alerts.find(x => x.level === "mismatch").detail, /不要依配置台的燈號操作/);
  });

  it("Worker 說有事但盤面正常 → 一樣要報", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const r = evaluate(prev, obs(sig({ risk_flag: true })), TODAY);
    a.ok(levels(r).includes("mismatch"));
  });

  it("一致時不報", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    a.ok(!levels(evaluate(prev, obs(sig()), TODAY)).includes("mismatch"));
  });
});

describe("監控 · 00653L 扳機", () => {
  it("未觸發 → 觸發:通知", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const r = evaluate(prev, obs(armed), TODAY);
    a.ok(levels(r).includes("tripwire"));
    a.match(r.alerts.find(x => x.level === "tripwire").detail, /下次月檢裁決/);
  });

  it("持續觸發:不重複通知", (a) => {
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const prev = evaluate(null, obs(armed), TODAY).state;
    a.ok(!levels(evaluate(prev, obs(armed), TODAY)).includes("tripwire"));
  });

  it("觸發 → 解除:通知", (a) => {
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const prev = evaluate(null, obs(armed), TODAY).state;
    a.ok(levels(evaluate(prev, obs(sig()), TODAY)).includes("tripwire-off"));
  });
});

describe("監控 · 隱私", () => {
  it("輸出的任何一層都不得出現持倉欄位", (a) => {
    /* 檢查結構(欄位名稱)而非散文——警報內文會提到「單次不超過持股 50%」
       這類規格描述,那是規則說明,不是你的實際部位。 */
    const FORBIDDEN = ["units", "cashTWD", "cashUSD", "peak", "prem", "inst", "tierTc", "V"];
    const keys = new Set();
    (function walk(x) {
      if (!x || typeof x !== "object") return;
      if (Array.isArray(x)) return x.forEach(walk);
      Object.keys(x).forEach(k => { keys.add(k); walk(x[k]); });
    })(evaluate(
      evaluate(null, obs(sig()), TODAY).state,
      obs(sig({ risk_flag: true, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } })),
      TODAY
    ));
    FORBIDDEN.forEach(k => {
      a.ok(!keys.has(k), `輸出出現持倉欄位「${k}」——這個 repo 與 Issue 都是公開的`);
    });
  });

  it("evaluate 由設計上就拿不到持倉(不是靠過濾)", (a) => {
    /* 最強的保證不是「有濾掉」而是「根本沒拿到」。
       evaluate 的參數只有前次心跳與市場觀測,呼叫端也不傳持倉。 */
    a.strictEqual(evaluate.length, 3, "evaluate(prev, obs, today) 應只有三個參數");
    const r = evaluate(null, obs(sig()), TODAY);
    a.ok(r.state && r.state.asof, "狀態來自市場資料");
    a.strictEqual(typeof r.alerts, "object");
  });

  it("狀態檔只含市場資料", (a) => {
    const r = evaluate(null, obs(sig()), TODAY);
    const allowed = ["checkedAt", "asof", "riskFlag", "spxLast", "spxSma12m", "spxBelow",
      "vixLast", "vixAbove", "tripwireArmed", "brent", "usdinr", "fx"];
    Object.keys(r.state).forEach(k => {
      a.ok(allowed.includes(k), `heartbeat 出現未預期欄位「${k}」,請確認不含私密資料`);
    });
  });
});

describe("監控 · 演練模式", () => {
  /* 演練是用來證明通知管道暢通的。它必須:
     不假造市場狀態、不污染心跳、內容明確標示為非真實警報。
     這裡驗證 check.js 的 workflow 契約(--drill 旗標與 if 條件)確實存在。 */
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "..", "monitor", "check.js"), "utf8");
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "daily-monitor.yml"), "utf8");

  it("演練不得寫入心跳", (a) => {
    a.match(src, /!DRY\s*&&\s*!DRILL/, "寫心跳的條件必須排除 DRILL");
    a.match(wf, /if:\s*\$\{\{\s*!inputs\.drill\s*\}\}/, "workflow 的更新心跳步驟必須跳過演練");
  });

  it("演練通知必須明確標示為非真實警報", (a) => {
    a.match(src, /非真實警報/);
    a.match(src, /不需要任何操作/);
    a.match(src, /level:\s*"drill"/, "層級須為 drill,與真實警報區隔");
  });

  it("workflow 有暴露 drill 開關", (a) => {
    a.match(wf, /drill:/);
    a.match(wf, /--drill/);
  });

  it("排程執行絕不進入演練模式", (a) => {
    /* inputs.drill 在 schedule 觸發時為空,不得意外帶入 --drill */
    a.match(wf, /inputs\.drill\s*&&\s*'--drill'\s*\|\|\s*''/,
      "必須用條件運算式,排程時要求值為空字串");
  });
});

describe("監控 · 契約測試失敗轉警報", () => {
  const { contractAlert } = require("../monitor/check.js");

  it("失敗項目會被萃取進通知內文", (a) => {
    const log = "\x1b[1m資料契約 · /signal\x1b[0m\n"
      + "  \x1b[32m✓\x1b[0m 回應可取得且通過引擎驗證\n"
      + "  \x1b[31m✗\x1b[0m 數值落在合理範圍(超出即代表上游資料異常)\n"
      + "  \x1b[31m✗\x1b[0m 布林旗標與底層數值自洽\n";
    const al = contractAlert(log);
    a.strictEqual(al.level, "contract-test");
    a.match(al.detail, /數值落在合理範圍/);
    a.match(al.detail, /布林旗標與底層數值自洽/);
    a.ok(!al.detail.includes("回應可取得且通過引擎驗證"), "通過的項目不該出現在失敗清單");
  });

  it("ANSI 色碼必須清掉(Issue 內文不該有亂碼)", (a) => {
    const al = contractAlert("\x1b[31m✗\x1b[0m 某項失敗\n");
    a.ok(!/\x1b\[/.test(al.detail), "殘留 ANSI escape");
  });

  it("拿不到日誌時仍要發出通知", (a) => {
    const al = contractAlert("");
    a.strictEqual(al.level, "contract-test");
    a.match(al.detail, /上游/);
  });

  it("通知須說明風險旗標未必受影響(避免誤判為停機)", (a) => {
    a.match(contractAlert("").detail, /風險旗標的判斷未必受影響/);
  });
});

describe("監控 · workflow 韌性契約", () => {
  const fs = require("fs");
  const path = require("path");
  const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "daily-monitor.yml"), "utf8");
  const ci = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "ci.yml"), "utf8");

  it("引擎測試失敗不得靜默中止,必須開 Issue", (a) => {
    a.match(wf, /id:\s*selftest/);
    a.match(wf, /continue-on-error:\s*true/);
    a.match(wf, /steps\.selftest\.outcome\s*==\s*'failure'/);
    a.match(wf, /gh issue create/, "失敗時必須開 Issue,不能只讓 job 紅掉");
  });

  it("契約測試不得中止監控", (a) => {
    a.match(wf, /id:\s*contract/);
    a.match(wf, /CONTRACT_FAILED/);
  });

  it("CI 在 push 與 PR 都要跑", (a) => {
    a.match(ci, /push:/);
    a.match(ci, /pull_request:/);
    a.match(ci, /node test\/run\.js/);
  });

  it("CI 必須檢查 engine.json 同步與 .nojekyll", (a) => {
    a.match(ci, /dump-params\.js --check/);
    a.match(ci, /\.nojekyll/);
  });

  it("CI 不得跑需連網的契約測試(避免上游抖動造成假性紅燈)", (a) => {
    a.ok(!/--contract/.test(ci), "契約測試應留在每日監控,不放 CI");
  });
});

describe("監控 · 多重警報", () => {
  it("同時過期又不一致 → 兩則都要出現", (a) => {
    const prev = evaluate(null, obs(sig()), TODAY).state;
    const bad = sig({ asof: { spx: "2026-07-01" }, risk_flag: false, spx: { last: 5200, sma12m: 7089, below: true } });
    const l = levels(evaluate(prev, obs(bad), TODAY));
    a.ok(l.includes("stale") && l.includes("mismatch"), "得到:" + l.join(","));
  });
});

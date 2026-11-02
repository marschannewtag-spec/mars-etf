/**
 * 監控判斷邏輯測試。
 *
 * 監控最危險的失效模式不是「誤報」而是「該報沒報」——
 * 風險期開始了卻靜默,你會以為一切正常。
 * 這裡逐條驗證翻轉偵測與去重。
 */
"use strict";
const { describe, it } = require("./harness.js");
const { evaluate, weeklyAlive, TRIPWIRE_TITLE } = require("../monitor/check.js");
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

const FS = require("fs");
const PATH = require("path");
const ROOT = PATH.join(__dirname, "..");
const src = FS.readFileSync(PATH.join(ROOT, "monitor", "check.js"), "utf8");
/* 註解裡會提到那些已修掉的寫法作為說明,比對前先剝掉註解行 */
const wfCode = FS.readFileSync(PATH.join(ROOT, ".github", "workflows", "daily-monitor.yml"), "utf8")
  .split(/\r?\n/).filter(l => !/^\s*#/.test(l)).join("\n");

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

  it("觸發 → 解除:不開新 Issue,改成關閉觸發那則", (a) => {
    /* 原本解除會再開一則 Issue,於是列表永遠留著一對開著的 Issue,
       而「要不要出場」那個裁決從來沒被記錄。新警報會藏在那堆雜訊裡。 */
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const prev = evaluate(null, obs(armed), TODAY).state;
    const r = evaluate(prev, obs(sig()), TODAY);
    a.deepStrictEqual(levels(r), [], "解除不該產生任何警報");
    a.strictEqual(r.closes.length, 1, "應該要關掉一則");
    a.strictEqual(r.closes[0].title, TRIPWIRE_TITLE,
      "標題必須與觸發那則完全相同,否則 workflow 找不回來");
    a.match(r.closes[0].detail, /不再同時滿足/);
  });

  it("觸發與解除指向同一個標題", (a) => {
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const on = evaluate(evaluate(null, obs(sig()), TODAY).state, obs(armed), TODAY);
    const off = evaluate(evaluate(null, obs(armed), TODAY).state, obs(sig()), TODAY);
    a.strictEqual(on.alerts.find(x => x.level === "tripwire").title, off.closes[0].title);
  });

  it("其他情況 closes 一律為空", (a) => {
    /* 拿不到資料就亂關 Issue,等於在最需要那則通知的時候把它關掉。 */
    const prev = evaluate(null, obs(sig()), TODAY).state;
    a.deepStrictEqual(evaluate(prev, obs(sig()), TODAY).closes, []);
    a.deepStrictEqual(evaluate(null, { at: "x", ok: false, error: "斷線" }, TODAY).closes, [],
      "Worker 掛了不可亂關");
    a.deepStrictEqual(evaluate(prev, obs({ spx: { last: 1, sma12m: 1 } }), TODAY).closes, [],
      "訊號破損不可亂關");
  });

  it("門檻由 PARAMS 帶出,通知文字不得寫死", (a) => {
    const armed = sig({ tripwire: { brent: 92.1, usdinr: 96.8, armed: true } });
    const d = evaluate(evaluate(null, obs(sig()), TODAY).state, obs(armed), TODAY)
      .alerts.find(x => x.level === "tripwire").detail;
    a.match(d, new RegExp("> " + E.PARAMS.TRIP_BRENT + " "));
    a.match(d, new RegExp("> " + E.PARAMS.TRIP_USDINR + ","));
    a.ok(!/> 90 /.test(src) && !/> 96/.test(src), "原始碼不得再出現裸門檻");
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

describe("監控 · 通知必須真的送達(去重與靜默失效)", () => {
  const fs = require("fs");
  const path = require("path");
  const root = path.join(__dirname, "..");
  const src = fs.readFileSync(path.join(root, "monitor", "check.js"), "utf8");
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "daily-monitor.yml"), "utf8");
  /* 註解裡會提到這些修掉的寫法作為說明,比對前先剝掉註解 */
  const wfCode = wf.split("\n").filter(l => !/^\s*#/.test(l)).join("\n");

  /* 這個 repo 沒有「監控」這個標籤(已查 API:兩則真實 Issue 的標籤欄都是 [])。
     用它來篩就等於永遠找不到舊 Issue,每則警報都開新的一則。 */
  it("去重不得依賴不存在的標籤", (a) => {
    a.ok(!/--label\s*監控/.test(wfCode),
      "workflow 不得再用 --label 監控:這個 repo 沒有該標籤,篩選永遠落空");
  });

  it("去重不得依賴 GitHub 全文搜尋(標題含中文與 emoji)", (a) => {
    a.ok(!/--search\s+"\$TITLE in:title"/.test(wfCode),
      "改用取回清單後本地比對,不靠搜尋索引");
    a.match(wfCode, /endswith\(\$t\)/, "應以標題結尾比對(標題前面是 [日期] )");
  });

  /* 過期天數每天加一。標題含天數就等於標題每天不同,去重永遠對不上:
     上游停更七天會開七個 Issue,使用者從此忽略通知。 */
  it("過期警報的標題不得含天數", (a) => {
    const long = Object.assign({}, sig(), { asof: { spx: "2026-07-20" } });
    const titles = ["2026-08-06", "2026-08-10", "2026-08-20"].map(d => {
      const r = evaluate(null, { at: d + " 16:00", ok: true, signal: long, fx: 32.2 }, d);
      const s = r.alerts.find(x => x.level === "stale");
      return s && s.title;
    });
    a.ok(titles.every(Boolean), "三個日期都該觸發過期警報:" + JSON.stringify(titles));
    a.strictEqual(new Set(titles).size, 1,
      "不同天數必須產生相同標題,否則去重失效:" + JSON.stringify(titles));
    a.ok(!/\d/.test(titles[0]), "標題不該含數字:" + titles[0]);
    const detail = evaluate(null, { at: "2026-08-20 16:00", ok: true, signal: long, fx: 32.2 }, "2026-08-20")
      .alerts.find(x => x.level === "stale").detail;
    a.match(detail, /已過期 \d+ 天/, "天數要在內文,不能就這樣消失");
  });

  /* 心跳讀取失敗若被當成「首次執行」,翻轉判斷 `if (prev && ...)` 不會比對,
     於是風險旗標翻轉完全靜默——最該通知的那一則反而不見。 */
  it("prev 為空時翻轉類警報確實不會發出(所以讀取失敗不可當成首次執行)", (a) => {
    const flipped = sig({ risk_flag: true, spx: { last: 5200, sma12m: 7089, below: true }, vix: { last: 48, above: true } });
    a.ok(!levels(evaluate(null, obs(flipped), TODAY)).includes("risk-on"),
      "這是既有行為:沒有前次狀態就不報翻轉");
    const armed = sig({ tripwire: { brent: 101, usdinr: 96.5, armed: true } });
    a.ok(!levels(evaluate(null, obs(armed), TODAY)).includes("tripwire"),
      "扳機翻轉同理");
  });

  it("心跳只在檔案不存在時才算首次執行,損毀必須拋錯", (a) => {
    a.match(src, /e\.code !== "ENOENT"/,
      "讀取失敗不可一律吞掉:損毀的心跳會讓風險旗標翻轉靜默");
    a.ok(!/catch \(e\) \{ \/\* 首次執行 \*\/ \}/.test(src), "舊的靜默寫法必須移除");
  });

  it("workflow 不得保留沒人讀的 output", (a) => {
    const declared = [...wf.matchAll(/echo "([a-z]+)=.*>> "\$GITHUB_OUTPUT"/g)].map(m => m[1]);
    declared.forEach(name => {
      a.match(wf, new RegExp("outputs\." + name),
        `output ${name} 有宣告卻沒有任何步驟讀取`);
    });
  });
});

describe("監控 · 死人開關(每週存活回報)", () => {
  /* 平常完全靜默,所以「沒收到通知」同時代表「一切正常」與「排程已經死了」,
     從通知本身分不出來。我自己在稽核時就誤判過一次:本地心跳停在兩個月前,
     一度認定監控死了,查 API 才發現是本地副本落後。這一則就是用來分開那兩種狀態。 */
  const state = evaluate(null, obs(sig()), TODAY).state;
  const FRI = "2026-11-06", MON = "2026-11-02";

  it("週五且無警報才發", (a) => {
    a.ok(weeklyAlive([], FRI, false, state), "週五無警報:要發");
    a.strictEqual(weeklyAlive([], MON, false, state), null, "非週五:不發");
  });

  it("有真警報時不發", (a) => {
    /* 那則警報本身就是存活證明;而且 workflow 以 alerts[0].title 當 Issue 標題,
       存活回報若擠進去就會把真警報的標題蓋掉。 */
    a.strictEqual(weeklyAlive([{ level: "risk-on", title: "🔴 風險期開始" }], FRI, false, state), null);
  });

  it("演練不發,否則演練會把當週的存活回報用掉", (a) => {
    a.strictEqual(weeklyAlive([], FRI, true, state), null);
  });

  it("標題固定不變,否則每週開一個新 Issue", (a) => {
    const t1 = weeklyAlive([], FRI, false, state).title;
    const t2 = weeklyAlive([], "2026-11-13", false, state).title;
    a.strictEqual(t1, t2, "去重靠標題,標題會變就等於沒有去重");
    a.ok(!/\d/.test(t1), "標題不得含日期或數字:" + t1);
  });

  it("內文帶當下市場狀態,但不得帶持倉", (a) => {
    const d = weeklyAlive([], FRI, false, state).detail;
    a.match(d, /風險旗標/);
    a.match(d, new RegExp(String(state.spxLast)));
    ["units", "cashTWD", "cashUSD", "peak", "tierTc"].forEach(k =>
      a.ok(!d.includes(k), "存活回報不得出現 " + k));
  });

  it("拿不到市場狀態時說清楚,不可印出 undefined", (a) => {
    const d = weeklyAlive([], FRI, false, null).detail;
    a.ok(!/undefined/.test(d), "得到:" + d);
  });

  it("main 確實把它接起來", (a) => {
    /* 寫好卻沒接上,單元測試照樣全綠——weightsSumToOne 就是這樣躺了一輪。 */
    a.match(src, /weeklyAlive\(alerts, taipeiToday\(\), DRILL, state\)/, "main 必須呼叫");
    a.match(src, /if \(alive\) alerts\.push\(alive\)/, "回傳值必須真的進警報清單");
  });
});

describe("監控 · workflow 的韌性", () => {
  /* 實測 61 次排程:最快晚 19 分、中位晚 4 小時 56 分、最慢晚 11 小時 39 分,
     43% 超過 6 小時。公開 repo 的排程是「有空才跑」,整點是最壅塞的槽位。 */
  it("排程不得排在整點", (a) => {
    const mins = [...wfCode.matchAll(/- cron: "(\S+) /g)].map(m => m[1]);
    a.ok(mins.length, "找不到 cron 設定");
    mins.forEach(m => a.notStrictEqual(m, "0", "分鐘不可為 0:整點是最壅塞的排程槽位"));
  });

  it("推送心跳前必須先拉取", (a) => {
    /* 你在 bot checkout 之後 push 任何東西,bot 的 push 就會被拒、整個 job 紅掉,
       而紅掉不會變成通知(通知步驟在它前面),當天的監控就靜靜失敗了。 */
    const at = wfCode.indexOf("git push");
    a.ok(at > 0, "找不到 git push");
    a.match(wfCode.slice(0, at), /git pull --rebase/, "git push 之前必須先 pull --rebase");
  });

  it("條件解除走關閉舊 Issue,不是開新的", (a) => {
    const from = wfCode.indexOf("outputs.closes");
    const step = wfCode.slice(from, wfCode.indexOf("name: 發出通知"));
    a.ok(from > 0 && step.length > 0, "找不到解除步驟");
    a.match(step, /gh issue close/, "解除必須關掉觸發那則");
    a.match(step, /endswith\(\$t\)/, "找回舊 Issue 要用同一套標題比對");
    a.ok(!/gh issue create/.test(step), "解除不得開新 Issue");
  });
});

# mars-etf — 2x 配置台

台股 2 倍槓桿 ETF 的配置決策台。三層攻守引擎:趨勢(SPX vs 12 月均線)× 波動(VIX 32)× 分層抄底。

## 結構

```
index.html          PWA:取資料、存狀態、呈現。不含決策邏輯。
engine/
  engine.js         決策核心「單一真相」。純函式,無 DOM / 無網路 / 無 localStorage。
  engine.json       由 dump-params.js 產生,給非 JS 消費端讀。勿手動編輯。
  dump-params.js    產生 engine.json
monitor/
  check.js          每日監控:抓市場資料 → 用共用引擎判斷 → 例外才發 Issue
  heartbeat.json    上次觀測到的市場狀態(只有市場資料,絕不含持倉)
.github/workflows/
  daily-monitor.yml 台北時間週一至五 16:00 執行
test/
  run.js            測試入口
  golden.test.js    黃金案例:策略規格的可執行版本
  invariant.test.js 不變量:隨機情境下恆須成立的性質
  parity.test.js    平價:共用引擎 vs 重構前實作,證明決策零變化
  contract.test.js  資料契約:Worker 五端點的結構與範圍(需網路)
  legacy.js         在 vm 沙箱載入凍結的舊實作作為平價參照
  fixtures/         凍結的參照原始碼(自動產生)
```

## 指令

```bash
node test/run.js              # 離線測試(黃金案例、不變量、平價)
node test/run.js --contract   # 加跑資料契約測試,會實際打 Worker
node test/run.js --only 平價   # 只跑名稱含關鍵字的 suite
node engine/dump-params.js    # 參數改動後重新產生 engine.json
```

改動引擎後 `node test/run.js` 必須全綠才可部署。

## 部署

線上版:https://marschannewtag-spec.github.io/mars-etf/(GitHub Pages,main 分支根目錄)

**index.html 不再是單一檔案**,必須與 `engine/` 目錄一起部署。
引擎載入失敗時 PWA 會整頁顯示錯誤並拒絕顯示任何配置建議(刻意的大聲失敗)。
`.nojekyll` 用來關閉 Pages 的 Jekyll 處理,確保 `engine/` 原樣發布——刪掉它線上版會停機。

## 每日監控

平常完全靜默,只在需要動手時開 GitHub Issue(手機收得到)。

**會通知**(市場驅動,時效性強):
風險旗標翻轉 · Worker 斷線 · 資料過期 > 4 天 · 上游格式破損 ·
00653L 扳機翻轉 · Worker 的 risk_flag 與 engine.js 獨立重算不一致

**不通知**(需要持倉,留在 PWA 本機算):權重漂移超帶 · 分層觸發

### 為什麼監控不碰持倉

這個 repo 是公開的,**GitHub Issue 也是全世界可讀**。
就算把持倉藏進 Actions secret,通知內容一旦帶金額仍等於公開。

`monitor/check.js` 的 `evaluate()` 由設計上就拿不到持倉——參數只有
前次心跳與市場觀測,不是靠事後過濾。test/monitor.test.js 有測試釘住這件事。

若日後想要含持倉的監控,乾淨做法是另開一個私有 repo,不要把這個改成私有
(Pages 在私有 repo 需要付費方案,改了線上版會停機)。

### 手動觸發

Actions 頁面 → 每日監控 → Run workflow。首次執行只建立心跳基準,不發翻轉通知。

workflow 會先跑 `node test/run.js`,引擎測試不過就中止——
引擎壞了就不該相信它的判斷。

## 引擎規格

參數的唯一真相是 `engine/engine.js` 的 `PARAMS`。

| 參數 | 值 | 意義 |
|---|---|---|
| BASE | 20% | 基準現金水位 |
| DEF | 50% | 風險期防禦現金水位 |
| CAP | 50% | 單次減碼上限(佔持股) |
| T30 | -30% | 首撥門檻 |
| DRIFT | 25% | 容忍帶(相對目標權重) |
| STALE | 4 天 | 市場資料可接受的最大延遲 |
| LADDER | -40%→10%, -50%→5% | 分層抄底階梯 |
| REARM | 5% | 回補遲滯 |

三條決策路徑:

1. **風險期** — 現金未達 50% 則減碼(單次不超過持股一半);已達則完全空手等待。**絕不投入、不再平衡。**
2. **正常期且需動作** — 回撤 ≤ -30% 且現金高於分層目標,或任一標的偏離目標超過 25% → 再平衡。
3. **都在帶內** — 無動作。

閘門(任一觸發即中止,且**不更新峰值與分層狀態**):訊號無效 / 未設定標的 / 報價缺失 / 資料過期 > 4 天 / 匯率無效。

## 安全設計

這些是刻意的,修改前請先理解為什麼:

- **訊號驗證 fail closed** — `/signal` 任何欄位缺漏都亮紅燈。`risk_flag` 缺失曾讓 SPX 破線 + VIX 48 的崩盤盤面顯示成「正常期」並建議加碼。
- **不變量攔截** — `makePlan` 產出的計畫會先過 `checkInvariants`,違反者攔截不顯示,寧可不下單也不出錯單。
- **閘門不推進狀態** — 資料不完整時推進峰值會把錯誤的低估值記成新峰值,污染之後所有回撤計算。
- **引擎缺席即停機** — 不 fallback、不猜預設值。
- **絕不自動下單** — PWA 與任何自動化都不碰券商帳戶。這是紅線,不是技術限制。

## 已知行為

- **dd 恰為 -35% 時遲滯提早一格鬆綁**。`-0.40 + 0.05` 在 IEEE754 下等於 `-0.35000000000000003`,比較結果為 false。實務影響為零(dd 是連續浮點),已在 golden.test.js 如實記錄。要修正需以獨立變更提出並同步更新平價參照。
- **減碼會略微超過 50% 上限**。股數必須整數,`floor` 一律向下取整,每檔最多多賣不到一股;實測最大溢出約總持股的 0.003%。
- **設定頁沒有「來源」欄位**。`src="us"` 的美股標的目前只能靠匯入 JSON 建立。
- **Worker 網址存在 localStorage**。改程式碼裡的預設值不會影響已在用的裝置,需手動至設定頁修改。

## 回測資料 D_RETS

432 筆月報酬,經驗證對應 1990-07 ~ 2026-06(註解寫 ~2026-07,含頭含尾應為 433 筆)。
產生它的 STEP 3b Python 引擎**已佚失**。

`node test/tools/verify-dataset.js` 會逐條比對壓測頁的宣稱:

| 宣稱 | 實測 | |
|---|---|---|
| 全期 CAGR 15.2% | 15.2% | ✓ 精準吻合 |
| 全期 MaxDD -62.6% | -62.6% | ✓ 精準吻合 |
| 2015 起 CAGR ~20% | 18.3% | ✓ 差 1.7pp |
| 2015 起 MaxDD -36% | -34.5% | ✓ |
| 最壞起點 -80% | -62.6% | † 見下 |
| 2000-03 起 13.8 年 1.09x | 1.65x | † |
| 4 年虧損機率 ~13% | 11.3–11.6% | † |

**† 的三項無法由 D_RETS 重現,壓測頁已標示。**

`-80%` 不是誤差而是**結構性不可能**:子區間的峰谷配對是全區間的子集,
任何起點的回撤都不可能深於全期的 -62.6%。最可能的解釋是原始回測用日頻資料,
而 D_RETS 是月頻——月底取樣看不到月中低點,兩個數字可同時成立但不可混用。

虧損機率的 11.3–11.6% 跨五組種子、10 萬條路徑穩定,
是區塊拔靴法的參數選擇差異,不是隨機誤差。

### 為什麼不重建 Python 回測引擎

1. **雙實作平價測試會變成演戲。** 若 Python 那份是照 engine.js 翻譯的,
   兩者不獨立,同樣的誤解會複製過去,測試永遠通過卻什麼都沒驗到。
   真正的第二實作是 Worker(它自己算 risk_flag/below/above/armed),
   契約測試已用 engine.js 獨立重算複核它。
2. **年度重跑回測抓不到東西。** 回測跑固定的歷史資料,同資料同引擎每年同結果。
   會漂移的是引擎程式碼,那已被黃金案例/不變量/平價測試釘住。
3. **頻率敏感度卡的是資料不是程式。** 需要日頻源資料(還要正確模擬 2x 每日重設的
   波動耗損),Worker 歷史只到 2023-08。重建引擎變不出資料。

若日後真要做,需要的是**日頻源資料**,不是引擎程式碼。

## 外部相依

Cloudflare Worker(預設 `green-term-c0ddetf2x-worker.marschannewtag.workers.dev`):

| 端點 | 回應 |
|---|---|
| `/signal` | `{asof:{spx}, spx:{last,sma12m,below}, vix:{last,threshold,above}, risk_flag, tripwire:{brent,usdinr,armed}, engine_directive}` |
| `/fx` | `{last:[日期, USDTWD], history}` |
| `/tw?no=代碼` | `{stockNo, realtime:{price}, month_daily:[[日期,收盤],...]}` |
| `/quotes?symbols=X` | `{X:{last:[日期,價格], history}}` |

Worker 自行計算 `risk_flag` / `below` / `above` / `armed`。契約測試會用 `engine.js` 獨立重算並比對——不一致即代表某一端有問題。

**Worker 歷史深度只到 2023-08**,`/signal` 不提供歷史序列。任何需要長期歷史的分析(例如再平衡頻率敏感度)都無法從此 repo 的資料進行,需要產生 `D_RETS` 的那套離線回測源資料。

## 注意

- **這個 repo 目前是公開的。** 若要放入實際持倉(`state.json`),必須先改為私有。
- `D_RETS`(432 筆月報酬 1990-07~2026-07)是回測引擎的**輸出**,不是輸入。無法從中反推不同再平衡節奏的結果。

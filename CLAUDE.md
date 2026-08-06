# mars-etf — 2x 配置台

台股 2 倍槓桿 ETF 的配置決策台。三層攻守引擎:趨勢(SPX vs 12 月均線)× 波動(VIX 32)× 分層抄底。

## 結構

```
index.html          PWA:取資料、存狀態、呈現。不含決策邏輯。
engine/
  engine.js         決策核心「單一真相」。純函式,無 DOM / 無網路 / 無 localStorage。
  engine.json       由 dump-params.js 產生,給非 JS 消費端讀。勿手動編輯。
  dump-params.js    產生 engine.json
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

**index.html 不再是單一檔案**,必須與 `engine/` 目錄一起部署。
引擎載入失敗時 PWA 會整頁顯示錯誤並拒絕顯示任何配置建議(刻意的大聲失敗)。

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

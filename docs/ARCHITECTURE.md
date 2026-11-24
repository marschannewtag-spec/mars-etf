# mars-etf 架構全圖

給接手這個專案的人或 LLM。`CLAUDE.md` 講的是「規格與為什麼」,這一份講的是
「東西長在哪、誰呼叫誰、資料怎麼流」。

**本文每一項結構事實都標了 `檔案:行號`,是 2026-11-24 於 `0567fbf` 當場讀出來的。**
程式碼會動,行號會漂;對不上的時候相信程式碼,並回來修這份文件。

驗證基準(當場重跑,非引用舊紀錄):

```
HEAD                0567fbf
node test/run.js    282 通過
```

---

## 1. 這個系統在回答什麼

每個月一次,回答一個問題:**這個月要不要動持倉、動什麼。**

輸入是市場狀態(SPX 相對 12 月均線、VIX、油價、印度盧比、匯率)與自己的持倉。
輸出是一句話結論,加上一張可以照著下單的清單。**下單永遠是人自己去做**,
系統不碰券商帳戶——這是紅線,不是技術限制。

---

## 2. 四個執行環境

這是理解這個專案最重要的一張圖。同一份 `engine.js` 跑在三個地方,
第四個地方是它的對照實作。

```
┌─ ① 瀏覽器(GitHub Pages)────────────────────────────────┐
│  index.html                                              │
│    └─ engine/engine.js        ← 決策核心,UMD            │
│    └─ data/d_rets.json        ← 432 筆月報酬,按鈕才抓    │
│    └─ monitor/heartbeat.json  ← 讀監控寫的心跳(見 §4)   │
│  狀態:localStorage key "etf2x"                          │
│  持倉只存在這裡。不上傳,不進版控。                        │
└──────────────────────────────────────────────────────────┘
                   │ fetch
                   ▼
┌─ ③ Cloudflare Worker(原始碼不在本 repo)─────────────────┐
│  /signal  /fx  /tw?no=  /quotes?symbols=                 │
│  自行計算 risk_flag / below / above / armed              │
│  ← 這是 engine.js 的「第二實作」,契約測試拿它複核         │
└──────────────────────────────────────────────────────────┘
                   ▲ fetch
                   │
┌─ ② GitHub Actions(每日監控)─────────────────────────────┐
│  monitor/check.js                                        │
│    └─ engine/engine.js        ← 同一份,require 進來     │
│  狀態:monitor/heartbeat.json(commit 進 main)           │
│  絕不碰持倉。Issue 全世界可讀。                           │
└──────────────────────────────────────────────────────────┘

┌─ ④ 本機 Node(測試)─────────────────────────────────────┐
│  test/run.js → 7 個測試檔 282 項                         │
│  test/legacy.js 在 vm 沙箱載入凍結的舊實作當平價參照      │
└──────────────────────────────────────────────────────────┘
```

**為什麼同一份引擎要跑在三個地方:** 決策邏輯只能有一份。監控如果自己重寫一套
判斷,它說「風險期」而網頁說「正常期」時,沒有人知道哪個對。

---

## 3. 模組地圖

```
index.html          1,400 行上下。取資料、存狀態、呈現。不含決策邏輯。
engine/
  engine.js         1,060 行。37 個函式。純函式,無 DOM / 無網路 / 無 localStorage。
  engine.json       由 dump-params.js 產生的機器可讀規格。勿手動編輯。
  dump-params.js    產生 engine.json
data/
  d_rets.json       432 筆月報酬(純陣列)。設定頁「最壞情況」用。
monitor/
  check.js          每日監控。11 個函式。
  heartbeat.json    上次觀測到的市場狀態。只有市場資料,絕不含持倉。
tools/
  serve.js          本機靜態伺服器。file:// 直接開會被 CORS 擋掉 fetch。
test/               7 個測試檔 282 項 + harness + 凍結參照
docs/               稽核、UI 檢討、搬機交接、本檔
.github/workflows/
  ci.yml            四道關卡
  daily-monitor.yml 台北時間週一至五 16:17
```

---

## 4. 資料流(含那個容易漏掉的迴路)

### 網頁:打開到看見結論

```
載入 index.html
  → engine.js 載入失敗就整頁報錯,拒絕顯示任何建議(刻意的大聲失敗)
  → localStorage "etf2x" → S            index.html:575
     JSON 壞掉時隔離備份成 "etf2x.corrupt.<ts>" 再以預設值啟動  index.html:576
  → fetchAll() 八個請求並行                index.html:718
       /signal · /fx · 每檔 /tw?no= · monitor/heartbeat.json
       實測:序列 825ms,並行 110ms
  → Q = {px, fx, sig, hb}
  → render() 畫面                          index.html:753
  → 按「執行月度檢查」→ runCheck()
       → EG.gateReasons() 五道閘門          engine.js:447
       → EG.computeState()                  engine.js:506
       → EG.advanceTier() 推進峰值與分層     engine.js:492
       → makePlan() → EG.makePlan()         index.html:872 → engine.js:531
       → EG.checkInvariants() 攔截          engine.js:682
       → setVerdict() 一句話結論
```

### 那個迴路:心跳被網頁讀回去

**扳機遲滯的狀態不在瀏覽器裡,在公開 repo 的檔案裡。**

```
每日監控 observe()                         check.js:55
  → evaluate(prev, obs, today)             check.js:81
       wasArmed = prev.tripwireArmed       check.js:109
       held = E.tripwireHeld(wasArmed,sig) check.js:110
       寫回 tripwireArmed                   check.js:121
  → commit monitor/heartbeat.json 進 main
  → GitHub Pages 服務這個檔案
  → 網頁 fetchHb() 抓它                     index.html:714
  → was = Q.hb.tripwireArmed               index.html:808
  → EG.tripwireHeld(was, s) 決定燈號         index.html:809
```

**為什麼要這樣繞:** 遲滯需要記住「上次有沒有觸發」。Worker 的 `armed` 是無狀態的
(兩個條件同時嚴格大於門檻就是 true),所以狀態必須存在某處。存在 localStorage
會讓每台裝置各自記一份、互相矛盾;存在心跳檔則是全世界同一份,而且監控本來就
每天在寫它。代價是**網頁的扳機燈號依賴 repo 保持公開**。

---

## 5. engine.js:37 個函式

純函式。沒有 DOM、沒有網路、沒有 localStorage。UMD 包裝,瀏覽器掛 `window.EG`,
Node 走 `module.exports`。匯出清單在 `engine.js:1047-1059`。

### 5.1 工具層

| 函式 | 行 | 職責 |
|---|---|---|
| `isPos` | 70 | 正數且有限。全檔的數值守門 |
| `numOk` | 73 | 有限數 |
| `hasId` | 76 | 標的有代碼 |
| `live` | 79 | 過濾出有代碼的標的。**到處都用,是「有效標的」的唯一定義** |

### 5.2 權重層

| 函式 | 行 | 職責 |
|---|---|---|
| `weightSum` | 89 | 目標權重合計。合計為 0 時回 0,**不退回預設分母**(見 §10) |
| `targetWeight` | 96 | 單一標的的目標權重 = `(1-tc) × tgt / weightSum` |
| `offBand` | 104 | 是否偏離容忍帶(相對目標權重 ±DRIFT) |
| `weightsSumToOne` | 1056 | 恆真式。**刻意不當防線用**,證明寫在原始碼註解 |
| `auditWeights` | 1018 | 配置體檢。回報三種設定錯誤 + 最大餘數法算出的修正值(0.1pp 粒度) |

### 5.3 估值層

| 函式 | 行 | 職責 |
|---|---|---|
| `priceTWD` | 112 | 報價換成台幣。美股標的乘匯率 |
| `valueTWD` | 119 | 單一標的市值 |
| `totals` | 131 | 組合總值 V、現金、`miss`(有標的抓不到報價) |
| `pnlOf` | 215 | 單一標的未實現損益 |
| `pnlTotal` | 225 | 全組合未實現損益 |
| `costAfter` | 246 | 計畫執行後的成本基礎。**成本必須跟著計畫走**,否則下次損益率是假的 |

### 5.4 訊號與驗證層

| 函式 | 行 | 職責 |
|---|---|---|
| `validateSignal` | 299 | **fail closed**。任何欄位缺漏都回錯誤字串 |
| `derivedRisk` | 312 | 用 `engine.js` 自己重算風險旗標 |
| `riskAgrees` | 319 | Worker 的 `risk_flag` 與自算是否一致。不一致即某一端有問題 |
| `tripwireArmed` | 330 | 00653L 觸發:Brent > 90 **且** INR > 96(嚴格大於) |
| `tripwireHeld` | 347 | 遲滯。已觸發後要 Brent < 88 **或** INR < 95.5 才解除 |
| `validateImport` | 368 | 匯入驗證。**拒絕而非自動修正** |
| `staleDays` | 404 | 日曆天。**閘門用這個** |
| `openDaysBehind` | 422 | 交易日。**只給顯示用**。無美股假日表,國定假日多算一天 |

### 5.5 狀態層

| 函式 | 行 | 職責 |
|---|---|---|
| `tierTarget` | 271 | 分層抄底目標現金水位,含 REARM 遲滯 |
| `advanceTier` | 492 | 推進峰值與分層。**資料不完整時絕不可呼叫** |
| `computeState` | 506 | 由持倉與訊號算出 `{V, cash, cf, tc, dd, risk, miss}` |
| `cashTWDAfter` | 476 | 套用後的台幣現金。算不出來回 `null`,**不可無聲歸零** |

### 5.6 決策層

| 函式 | 行 | 職責 |
|---|---|---|
| `gateReasons` | 447 | 五道閘門。任一觸發即中止,**且不推進峰值與分層** |
| `makePlan` | 531 | 本期計畫。三條路徑,見 §6 |
| `allocateCash` | 621 | 加碼分配 |
| `checkInvariants` | 682 | 不變量攔截。違反者不顯示 |

### 5.7 匯入層

| 函式 | 行 | 職責 |
|---|---|---|
| `parseBrokerPaste` | 788 | 券商庫存文字解析。內含 `nums`(801)、`decs`(809) |
| `sameOcrGroup` | 164 | OCR 混淆組判定 |
| `fixOcrCodes` | 177 | OCR 代碼修補。只准差一個字元且必須唯一命中 |
| `diffHoldings` | 971 | 貼上即真相。沒出現的代碼視為已出清 |

---

## 6. 三條決策路徑

`makePlan` 從上到下,第一個命中就回傳。`engine.js:531`

```
0. 權重合計為 0            → hold「請至設定頁填入目標權重」
                              engine.js:538

1. 風險期(st.risk)       → engine.js:546
     現金 < DEF - CASH_EPS
       無持股              → hold「維持空手等待旗標熄滅」
       有持股              → trim,賣出 min(DEF×V - cash, CAP×hold)
     現金已達 DEF          → hold 完全空手等待
   ★ 絕不投入、不再平衡

2. 正常期且需動作          → rebalance
     觸發條件二擇一:
       回撤 ≤ T30(-30%)且現金高於分層目標
       任一標的偏離目標超過 DRIFT(25%)

3. 都在帶內                → hold
```

### 五道閘門(`gateReasons`,engine.js:447)

| 閘門 | 條件 |
|---|---|
| 訊號無效 | `validateSignal` 回非空 |
| 未設定標的 | `live(inst)` 為空 |
| 報價缺失 | 任一有效標的沒有正報價 |
| 資料過期 | `staleDays > STALE`(4 天,**數日曆天**) |
| 匯率無效 | `fx` 非正數 |

**閘門不推進狀態。** 資料不完整時推進峰值,會把錯誤的低估值記成新峰值,
污染之後所有回撤計算。

---

## 7. PARAMS(唯一真相,engine.js:20-66)

```
BASE               0.20      基準現金水位
DEF                0.50      風險期防禦現金水位
CAP                0.50      單次減碼上限(佔持股)
T30               -0.30      首撥門檻
DRIFT              0.25      容忍帶(相對目標權重)
PREM               1.0       溢價警示門檻
STALE              4         市場資料可接受的最大延遲(日曆天)
LADDER             [[-0.50, 0.05], [-0.40, 0.10]]
REARM              0.05      回補遲滯
VIX_THRESHOLD      32
SMA_MONTHS         12
TRIP_BRENT         90        00653L 觸發門檻(嚴格大於)
TRIP_USDINR        96
TRIP_BRENT_OFF     88        觸發後的解除門檻(遲滯)
TRIP_USDINR_OFF    95.5
MIN_TRADE_FRACTION 0.005     再平衡下單門檻,低於就不動
CASH_EPS           0.001     現金偏離容差
```

`engine.json` 是它的機器可讀複本,由 `dump-params.js` 產生。CI 第 2 關擋參數漂移。
**那套要讀 `engine.json` 的 Python 回測引擎已佚失**,保留的理由是它當人與 LLM 讀的規格。

---

## 8. 狀態模型

三份狀態,各自住在不同地方,互不覆蓋。

### ① `localStorage["etf2x"]` — 持倉,只在本機

```
inst      [{id, name, tgt, src, pocket}]   標的清單
units     {代碼: 股數}                      持股
cost      {代碼: 成本}                      成本基礎
prem      {代碼: 溢價}
cashTWD   number
cashUSD   number
peak      number                           歷史最高組合總值。只往上
tierTc    number                           當前分層目標現金水位
worker    string                            Worker 位址
log       string[]                          最多 500 筆操作紀錄
```

初始化在 `index.html:575-590`。`peak` 只往上是刻意的:它是回撤的分母。

**誰控制 `worker` 就控制 `risk_flag`**,能讓配置台在崩盤中顯示「正常期」。
所以匯入時位址有變動必須明示確認。

### ② `Q` — 本次連線抓到的市場資料,記憶體內

```
Q = {px: {代碼: 價格}, fx: number, sig: /signal 回應, hb: heartbeat.json}
```
`index.html:606`

### ③ `monitor/heartbeat.json` — 市場狀態,commit 進公開 repo

```
checkedAt asof riskFlag spxLast spxSma12m spxBelow
vixLast vixAbove tripwireArmed brent usdinr fx
```

**絕不含持倉。** `evaluate()` 由設計上拿不到持倉——參數只有前次心跳與市場觀測,
`test/monitor.test.js` 釘住這件事。因為監控會開 Issue,而 Issue 全世界可讀。

---

## 9. index.html:36 個函式,四個頁面

```
#view-today   本月檢查。一句話結論 + 訂單 + 市場快照
#view-hold    持倉。每檔的市值、權重、偏離、損益
#view-set     設定。標的、目標權重、現金、貼上庫存、最壞情況
#view-more    備份與進階。沒有自己的頁籤,高亮留給「設定」
```

### 薄包裝:決策不得住在呈現層

```js
function totals(){return EG.totals(engCtx())}                    index.html:751
function tierTarget(dd,prev){return EG.tierTarget(dd,prev)}      index.html:752
function sigBad(s){return EG.validateSignal(s)}                  index.html:753
```

`makePlan`(index.html:872)多做一件事:呼叫 `EG.makePlan` 之後立刻
`EG.checkInvariants`,違反就記錄並不顯示。**攔截發生在呈現層,判斷不在。**

目標權重、容忍帶、過期天數、最小交易門檻都只剩引擎那一份。
CI 第 4 關抓不到「有沒有偷偷重寫引擎」,所以 `guards.test.js` 直接斷言
那些公式不在網頁原始碼裡。

### 函式分組

```
狀態       engCtx(736) capNow(743) readUI() save() log()
估值包裝   totals(751) pxTWD() valTWD() tierTarget(752) sigBad(753)
取資料     j() fetchPx() fetchHb(714) fetchAll(718) dRets()
決策       makePlan(872) runCheck() applyPlan() applyParsed()
呈現       render(753) renderUnits() renderWeights() renderAudit()
           renderLog() setVerdict() planHead() orderText() toast()
匯入       handleImage() prepVariants() ocrScore() loadTesseract()
導覽       go() initUI()
雜項       sanad()
```

---

## 10. monitor/check.js:11 個函式

```
taipeiNow(40) taipeiToday(43)     台北時間。用 UTC 會在凌晨差一天
get(47)                            打 Worker
observe(55)                        抓市場資料
evaluate(81)                       判斷。★ 拿不到持倉
contractAlert(207)                 Worker 與自算不一致
isFriday(221) weeklyAlive(232) aliveAlert(246)   每週存活回報
reasonText(262)                    通知文字
main(273)                          入口
```

### 通知矩陣

| 會通知(市場驅動,時效性強) | 不通知(需要持倉,留在 PWA 本機算) |
|---|---|
| 風險旗標翻轉 | 權重漂移超帶 |
| Worker 斷線 | 分層觸發 |
| 資料過期 > 4 天 | |
| 上游格式破損 | |
| 00653L 扳機翻轉 | |
| Worker `risk_flag` 與自算不一致 | |

**每週五存活回報:** 全靜默時「沒收到通知」同時代表「一切正常」與「排程已死」。
每週五固定留言一則,**連續兩個週五沒收到就是排程停了**。標題固定不變,
整年累積在同一則 Issue 成為時間軸。

**條件解除走關閉,不開新 Issue。** 找不到原本那則就什麼都不做:
你沒看到的觸發,解除不是新聞。

**排程刻意不排整點。** 實測 61 次,中位晚 4h56m、最慢 11h39m、43% 超過 6 小時。
整點是公開 repo 最壅塞的槽位,改成 08:17 UTC。

---

## 11. 測試架構

```
test/run.js            入口。--contract 才打網路,--only 關鍵字篩 suite
test/harness.js        極簡 describe/it/assert
test/legacy.js         在 vm 沙箱載入凍結的舊實作

檔案                  suite   項數   性質
golden.test.js            6     38   黃金案例:策略規格的可執行版本
guards.test.js           27    165   防線:拿掉就會紅
invariant.test.js         4     10   隨機情境下恆須成立的性質
monitor.test.js          12     56   監控行為與「拿不到持倉」
parity.test.js            1      5   共用引擎 vs 重構前實作
dataset.test.js           3      8   D_RETS 的可重現與不可重現宣稱
contract.test.js          4     13   Worker 端點(需網路,CI 不跑)
                               ───
                               282   離線 269 + 契約 13
```

### 防線怎麼寫:三面都要守

只檢查數字時,訂單方向反轉、股數改成 99999 都能通行,而**人照著訂單下單**;
匯入 -500 股能造出 -70% 的假回撤並寫進峰值。所以三面:

1. **入口** `validateImport`
2. **訂單** orders ↔ units 自洽
3. **權重** `makePlan` 開頭的「合計為 0」閘門

權重那道刻意**不是** `weightsSumToOne`,那是恆真式。

### mutation testing 的驗收標準

「拿掉防線就會紅」不只要看到紅,還要確認三件事:

1. 突變**真的套用了**(改到的是那一行)
2. 測試情境**真的走過那段碼**(不是在前面就被別的檢查擋掉)
3. 紅的原因是斷言失敗,不是語法錯

歷史上三個教訓:

- **死碼假通過。** `openDaysBehind` 裡 `if (t < a) return 0;` 拿掉也不變紅——
  迴圈本來就回 0。那不是防線,是死碼,刪掉。
- **情境沒走到。** ±3× 量級過濾器拿掉不紅,因為測資在前一道就被擋掉。
- **`indexOf` 的 −1 陷阱。** `a.ok(rc.indexOf("st.V>0") < rc.indexOf("makePlan(st)"))`
  在防線被拿掉時仍然綠:字串消失、`indexOf` 回 −1,而 −1 小於任何數。
  **要先斷言 `>= 0` 再比順序。**

### 與平價參照的刻意分歧

平價測試證明重構沒有改變決策。**唯一的例外**:目標權重合計為 0 時,
參照(`4916c0a`)的 `INV()` 退回預設分母 0.8,每檔目標算成 0,
於是**建議清倉 100% 現金**且所有不變量通過;現在 `weightSum` 回 0,`makePlan` 擋下。

4000 個情境裡 12 個(0.30%)。`parity.test.js` 對這 12 個**斷言新版確實擋下**,
不是跳過比對。**絕不為了讓平價變綠而重建凍結參照。**

---

## 12. CI 與部署

### 四道關卡(`.github/workflows/ci.yml`)

```
1. 引擎測試(離線)
2. engine.json 與 engine.js 的 PARAMS 同步檢查
3. index.html 內嵌 script 語法檢查
4. 確認 index.html 仍引用共用引擎、.nojekyll 仍在
```

**CI 刻意不跑契約測試。** 需連網,上游抖動會造成與程式碼無關的紅燈,
被忽略的紅燈等於沒有 CI。改放在每日監控,失敗轉為通知。
**有測試釘住這個決定,不要把 `--contract` 加進 CI。**

### 部署

```
main 分支根目錄 → GitHub Pages → https://marschannewtag-spec.github.io/mars-etf/
```

**push 就是上線,沒有審核環節。** CI 是「壞掉的引擎」與「上線」之間唯一的關卡。

- `index.html` **不是單一檔案**,必須與 `engine/` 和 `data/` 一起部署
- `.nojekyll` 確保 `engine/` 與 `data/` 原樣發布,**刪掉它線上版會停機**
- **沒有 service worker,離線打不開**(拆成多檔案帶進來的回歸)。不補,
  只讓訊息分辨得出「沒網路」與「部署壞了」
- 本機工作目錄是 CRLF,git 與 Pages 服務 LF。
  **驗證線上位元組時,期望值 = 本機位元組 − CRLF 數**

### 每日監控會自己 push

`main` 上會不斷出現 `chore(monitor): 更新心跳`。`git push` 被拒絕通常就是這個,
`git pull --rebase origin main` 即可,不會衝突(只動 `heartbeat.json`)。

---

## 13. 安全設計(修改前先理解為什麼)

| 設計 | 沒有它會怎樣 |
|---|---|
| 訊號驗證 fail closed | 缺 `risk_flag` 曾讓 SPX 破線 + VIX 48 的崩盤顯示成「正常期」並建議加碼 |
| 不變量攔截 | 寧可不下單也不出錯單 |
| 攔截層三面都守 | 訂單方向反轉、股數 99999 都能通行,而人照著下單 |
| 匯入拒絕而非自動修正 | -500 股被夾成 0,損壞的備份繼續產生看似正常的建議 |
| 閘門不推進狀態 | 低估值被記成新峰值,污染之後所有回撤 |
| 決策不住呈現層 | 決定要不要下單的程式零測試 |
| 寧可不套用,不要套用一半 | 美元現金超過計畫現金時無聲歸零,總資產憑空蒸發還寫進峰值 |
| 匯入可換資料來源要確認 | 誰控制 `worker` 就控制 `risk_flag` |
| 引擎缺席即停機 | 不 fallback、不猜預設值 |
| **絕不自動下單** | 紅線,不是技術限制 |

---

## 14. 紅線

1. **絕不自動下單。**
2. **這個 repo 是公開的。** 實際持倉絕不進版控、commit message、測試 fixture、
   UI placeholder。持倉備份 `etf2x-changelog.json` 放在 repo 的**上一層**。
3. **不要改成私有。** Pages 在私有 repo 需付費方案,改了線上版會停機。
4. **不要重建凍結參照** `test/fixtures/legacy-engine-4916c0a.js`。
5. **不要把 `--contract` 加進 CI。**
6. **不要刪 `.nojekyll`。**
7. **不要在 `https://marschannewtag-spec.github.io` 上寫 localStorage**,
   除非先確認它是空的。那是正式網域,裡面是本人真實持倉。

---

## 15. 已知限制

| 限制 | 性質 |
|---|---|
| `dd` 恰為 -35% 時遲滯提早一格鬆綁 | IEEE754。`-0.40+0.05 = -0.35000000000000003` |
| 減碼略微超過 50% 上限 | `floor` 向下取整,實測最大溢出約總持股 0.003% |
| 設定頁沒有「來源」欄位 | `src="us"` 只能靠匯入 JSON 建立 |
| 券商貼上只認 0 開頭的代碼 | 2330 與四位數股數在形狀上無從分辨。**假警報比漏報更糟** |
| `openDaysBehind` 無美股假日表 | 國定假日多算一天 |
| Worker 網址存在 localStorage | 改程式碼預設值不影響已在用的裝置 |
| 沒有 service worker | 離線打不開 |
| 真實 iPhone / Safari 未測 | 只在瀏覽器窗格量過 360 / 390 / 768 / 1440 |
| **Worker 原始碼不在版控** | 見下 |

### Worker 原始碼:已決定接受這個風險

契約在 `CLAUDE.md`,判斷規則在 `engine.js` 有獨立第二份,持倉不在 Worker 裡,
Worker 也不會自己壞。**真正會賠掉的只有上游資料源的接線**——
SPX / VIX / Brent / USDINR / 台股報價各自打哪個 API、12 月均線怎麼算。
重建要靠試誤,幾小時到一天。詳見 `docs/HANDOVER.md` §6。

### D_RETS:三項宣稱無法重現

432 筆月報酬,1990-07 ~ 2026-06。產生它的 Python 引擎已佚失。
`node test/tools/verify-dataset.js` 逐條比對。

`最壞起點 -80%` 不是誤差而是**結構性不可能**:子區間的峰谷配對是全區間的子集,
任何起點的回撤都不可能深於全期的 -62.6%。最可能的解釋是原始回測用日頻、
D_RETS 是月頻。**要的是日頻源資料,不是引擎程式碼。**

---

## 16. 給接手的 LLM:從哪裡開始

```
想知道「策略為什麼這樣設計」      → CLAUDE.md
想知道「東西長在哪、誰呼叫誰」    → 本檔
想在新機器上跑起來               → docs/HANDOVER.md
想查某個概念連到哪                → graphify-out/GRAPH_REPORT.md
                                   或 graphify query "<問題>"
```

改動前的最小檢查:

```bash
node test/run.js          # 必須全綠才可推。推上去就是上線
```

改引擎時三件事一起改:`engine.js` 的 `PARAMS`、`node engine/dump-params.js`
重新產生 `engine.json`、`golden.test.js` 記錄新行為。CI 第 2 關會抓參數漂移。

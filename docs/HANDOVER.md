# 搬機交接 — 2026-11-09

這份檔案是給「在另一台電腦上接手這個專案的人或 Claude Code」看的。
專案本身的規格、參數與設計理由都在根目錄的 `CLAUDE.md`,**先讀那一份**。
這裡只講搬機:新電腦要準備什麼、`git clone` 帶不到什麼、現在的狀態停在哪裡。

---

## 1. 新電腦要有什麼

| 需要 | 版本 | 為什麼 |
|---|---|---|
| Node.js | **24 以上** | CI 與每日監控都釘在 `node-version: "24"`。測試用 Node 內建的 `vm` 與 `node:test` 風格 harness,不裝任何套件。 |
| Git | 任意近代版本 | — |
| GitHub CLI (`gh`) | 建議 | PR 與 Actions 都靠它看。要先 `gh auth login`。 |
| Chrome / Edge / Chromium | 任意 | Claude Code 的瀏覽器窗格與 `design-taste-frontend` 技能的檢查器需要。 |

**沒有 `package.json`、沒有 `node_modules`、沒有建置步驟。** 不要加。
整個專案是一個 `index.html` + `engine/engine.js` + `data/d_rets.json`,零相依是刻意的。

---

## 2. 三步開工

```bash
git clone https://github.com/marschannewtag-spec/mars-etf.git
cd mars-etf
node test/run.js
```

最後一行必須看到 **`275 通過`**。沒有全綠就先別動任何東西,問題不在你的改動而在環境。

然後把 `mars-etf` 這個資料夾直接用 Claude Code 開啟,說「讀 CLAUDE.md 和 docs/HANDOVER.md,接手」。

要在本機看頁面:

```bash
node tools/serve.js . 8777
```

**不要用 `file://` 直接開 `index.html`。** CORS 會擋掉 `fetch`,`engine/` 與 `data/` 載不進來,整頁報錯——那是刻意的大聲失敗,不是環境壞了。
Claude Code 使用者按預覽時會自己讀 `.claude/launch.json` 起同一支伺服器。

---

## 3. `git clone` 帶不到的東西

搬機最容易漏的就是這一段。下表的「狀態」欄說明這次已經處理到哪裡。

| 東西 | 原本在哪 | 狀態 |
|---|---|---|
| `docs/`(本檔 + 稽核 + UI 檢討) | 未加入版控 | **已改為納入版控**,clone 就帶到 |
| `.claude/launch.json` | 在 repo 的**上一層**資料夾,且指向一個已被清掉的暫存路徑 | **已搬進 repo 並改成相對路徑** |
| `tools/serve.js` | 根本不存在(原本用暫存資料夾裡的腳本) | **已新增**,納入版控 |
| `.taste-skill/`(設計技能的工作目錄) | 未加入版控,2.2 MB 截圖 | **已加入 `.gitignore`**。截圖可重新產生;只有 `direction.json` 記錄了當初抽到的美術方向,不可重現,已放進搬機包 |
| `monitor/result.json` | `.gitignore` 內 | 每日監控自己會重新產生,不用帶 |
| `etf2x-changelog.json`(**含持倉股數**) | repo 的上一層資料夾 | **故意不進版控**,見下面第 5 節。放在搬機包的 `private/` |
| Claude Code 專案記憶 | `~/.claude/projects/D--GITHUB-ETF/memory/` | 是空的,沒有東西要帶 |
| 使用者層技能(`caveman`、`design-taste-frontend`、`graphify`) | `~/.claude/skills/` | 屬於你的 Claude 設定,不屬於這個 repo。新電腦要用就自己複製那個資料夾 |

---

## 4. 現在停在哪裡

- **最後一次策略相關的變更**:`c2e7077`(PR #14 的合併)。之後只有文件與開發工具的變更,沒有再動過 `engine/`、`index.html`、`data/`。目前 HEAD 看 `git log -1`。
- **線上版**:https://marschannewtag-spec.github.io/mars-etf/ 回 200,服務的就是 PR #14 那一版,位元組逐支比對過。
- **測試**:275 項離線測試全綠(2026-11-09 於 Node 24.18.0 實測,解壓後的副本上也重跑過)。
- **CI 與 Pages**:綠。

### 搬機整理動了什麼

這些都已經提交並推上 `main`,所以 `git clone` 就帶到,不需要從搬機包手動補:

| 檔案 | 改了什麼 | 為什麼 |
|---|---|---|
| `tools/serve.js` | 新增 | 原本用的是暫存資料夾裡的腳本,暫存一清就沒了 |
| `.claude/launch.json` | 從 repo 上一層搬進來,改相對路徑 | 原本指向那個已被清掉的暫存路徑,**搬機前就已經是壞的** |
| `docs/` | 納入版控 | 原本未追蹤,`git clone` 帶不到 |
| `.gitignore` | 加 `.taste-skill/` 與 `.claude/settings.local.json` | 前者是 2.2 MB 可重新產生的截圖;後者是每台機器各自的權限設定,靠全域 ignore 擋不保證換機後還在 |
| `CLAUDE.md` | 測試數 274 → 275;結構與指令補上 `tools/`、`.claude/`、`docs/` | 274 是舊數字,實測是 275 |

一筆 commit,只碰文件與開發工具,不碰策略決策。照慣例這個 repo 走 PR(`#13`、`#14` 都是),這一筆因為不影響引擎而直接推 `main`——CI 四道關卡照跑。

---

## 5. 紅線(先理解再動)

這些不是技術限制,是刻意的決定。推翻任何一條之前請先讀 `CLAUDE.md` 對應的段落。

1. **絕不自動下單。** PWA 與任何自動化都不碰券商帳戶。
2. **這個 repo 是公開的。** 實際持倉絕不進版控、不進 commit message、不進測試 fixture、不進 UI 的 placeholder。`etf2x-changelog.json` 因此留在 repo 外面。
3. **不要把 repo 改成私有。** Pages 在私有 repo 需付費方案,改了線上版會停機。要含持倉的監控就另開一個私有 repo。
4. **不要為了讓平價測試變綠而重建凍結參照**(`test/fixtures/legacy-engine-4916c0a.js`)。那份參照證明重構沒有改變決策,改它等於把證據改掉。
5. **不要把 `--contract` 加進 CI。** 需連網,上游抖動會造成與程式碼無關的紅燈;被忽略的紅燈等於沒有 CI。有測試釘住這個決定。
6. **不要刪 `.nojekyll`。** 刪了 `engine/` 與 `data/` 不會原樣發布,線上版停機。
7. **不要在 `https://marschannewtag-spec.github.io` 上寫 localStorage**,除非先確認它是空的。那是正式的 PWA 網域,裡面是本人真實的持倉。

---

## 6. Worker 原始碼不在這裡(已決定接受這個風險)

`index.html`、`monitor/check.js`、`test/contract.test.js` 三處都預設打
`https://green-term-c0ddetf2x-worker.marschannewtag.workers.dev`。
這支 Cloudflare Worker 自己算 `risk_flag` / `below` / `above` / `armed`,是整個系統的資料來源,也是契約測試用來複核 `engine.js` 的第二實作。

**它的原始碼不在這個 repo 裡,也不在搬機包裡。** 只存在於 Cloudflare 的帳號裡。

**本人已決定接受這個風險,不備份。** 理由成立,記在這裡是為了讓之後的人不必重新討論一遍:

- **契約是完整的。** 四個端點的回應結構寫在 `CLAUDE.md` 的「外部相依」,`test/contract.test.js` 釘住結構與數值範圍。
- **計算邏輯有第二份。** `risk_flag` / `below` / `above` / `armed` 在 `engine.js` 裡有獨立實作,契約測試本來就是拿它複核 Worker 的。要重寫 Worker,判斷規則不必重新想。
- **沒有資料會消失。** 持倉在瀏覽器的 localStorage 與 `etf2x-changelog.json`,不在 Worker 裡。Worker 只是即時行情的轉接頭。
- **Worker 不會自己壞。** 風險是手滑刪掉或覆寫,或失去 Cloudflare 帳號,不是會隨時間腐朽。

**真正會賠掉的只有一件事:上游資料源的接線。** SPX、VIX、Brent、USDINR、台股報價各自來自哪個 API、怎麼算 12 月均線——這部分只在 Worker 原始碼裡。重建要靠試誤,幾個小時到一天,不是幾分鐘。

要改變這個決定,成本很低:Cloudflare dashboard → 那支 Worker → 複製程式碼 → 存進一個**私有** repo 或離線備份。需要本人登入,所以只有本人做得到。

另外 `engine.json` 的讀者(STEP 3b 的 Python 回測引擎)與產生 `data/d_rets.json` 的那套程式**都已經佚失**,這點 `CLAUDE.md` 已記錄,不是搬機造成的。

---

## 7. 已知沒做完的事

搬機包不含、也沒辦法在這台機器上驗的:

- **真實 iPhone / Safari 硬體測試。** 版面只在瀏覽器窗格的 360 / 390 / 768 / 1440 四個寬度量過,四頁共 16 組零溢出,但那是桌機 Chromium 模擬出來的。
- **`2330` 這類個股代碼認不出來。** `parseBrokerPaste` 只認 0 開頭的代碼,因為四位數的個股代碼和四位數的股數在形狀上無從分辨。刻意的,理由在 `CLAUDE.md` 的「已知行為」。
- **扳機沒有遲滯。** 留待獨立的策略變更。

---

## 8. 第一次貼庫存要注意

新電腦第一次用「貼上券商庫存」時:**券商畫面要整個捲完、全部貼上。**
沒出現在文字裡的代碼會被當成已出清而歸零(`diffHoldings` 的設計,理由在 `CLAUDE.md`)。
預覽表會用紅字把每一檔要歸零的列出來——按「套用」之前看一眼那張表。

歸零會讓組合總值掉下來,而峰值只往上,於是憑空出現一段回撤,回撤又決定分層抄底。
App 會在月檢之後明說這件事並指向兩個解法:錢還在帳戶就去「手動校正」填現金,錢已轉走才去「備份與進階」按重設峰值。**兩件都不做,它會把這段當成真的下跌並據此建議加碼。**

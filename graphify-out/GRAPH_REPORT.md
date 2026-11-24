# Graph Report - mars-etf-main  (2026-11-24)

## Corpus Check
- Corpus is ~34,464 words - fits in a single context window. You may not need a graph.

## Summary
- 547 nodes · 919 edges · 31 communities (29 shown, 2 thin omitted)
- Extraction: 88% EXTRACTED · 12% INFERRED · 0% AMBIGUOUS · INFERRED: 107 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- 引擎核心與估值
- 網頁流程與狀態
- 監控與工具腳本
- 測試骨架與套件
- 每日監控排程
- 凍結的平價參照
- 匯入正確性與假綠
- CI 工作流
- 回測資料驗證
- 部署與單一真相
- 平價測試機制
- 稽核結論與精簡
- 扳機遲滯與心跳
- 紅線與專案治理
- 引擎分層與資料流
- 已知行為與限制
- 參數與決策路徑
- 版面量測與 CSS 陷阱
- 外部相依與佚失件
- 安全設計與防線
- 不變量與入口驗證
- 契約測試與排程
- 峰值與分層狀態
- 重複實作與參數漂移
- 通知閉環與資料新鮮度
- 信任邊界
- 沉默失效與防護不對稱
- 架構定位與參數歸屬
- 加碼試算與閘門補強
- 未定義的 CSS 變數

## God Nodes (most connected - your core abstractions)
1. `render() 全頁重繪` - 24 edges
2. `live()` - 15 edges
3. `btnAuto 依目標配置自動分配` - 14 edges
4. `runCheck()` - 13 edges
5. `runCheck() 月度檢查` - 13 edges
6. `render()` - 12 edges
7. `已知行為清單` - 12 edges
8. `fetchAll() 並行取市場資料` - 11 edges
9. `priceTWD()` - 10 edges
10. `steps` - 9 edges

## Surprising Connections (you probably didn't know these)
- `btnAuto 依目標配置自動分配` --semantically_similar_to--> `makePlan()`  [INFERRED] [semantically similar]
  index.html → engine/engine.js
- `engine.js 37 個純函式與 UMD 包裝` --semantically_similar_to--> `共用引擎為單一真相`  [INFERRED] [semantically similar]
  docs/ARCHITECTURE.md → CLAUDE.md
- `五道閘門表` --semantically_similar_to--> `五道閘門 gateReasons`  [INFERRED] [semantically similar]
  docs/ARCHITECTURE.md → CLAUDE.md
- `LIVE() 有效標的清單` --calls--> `live()`  [EXTRACTED]
  index.html → engine/engine.js
- `pxTWD() 單檔台幣價格` --calls--> `priceTWD()`  [EXTRACTED]
  index.html → engine/engine.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **月度檢查流程(取資料 → 閘門 → 計畫 → 套用)** — index_runcheck, index_fetchall, index_render, index_makeplan, index_applyplan, index_boot [EXTRACTED 1.00]
- **fail-closed 資料防線(訊號、閘門、不變量、狀態不推進)** — index_sigbad, index_fail_closed_signal, index_gate_no_state_advance, index_invariant_intercept, index_engine_absent_halt [INFERRED 0.85]
- **截圖 → 文字 → 解析管線** — index_handleimage, index_loadtesseract, index_prepvariants, index_ocrscore, index_btnparse, index_applyparsed [EXTRACTED 1.00]
- **三面防線:入口、訂單、權重** — claude_three_sided_guards, claude_import_reject_not_clamp, claude_invariant_interception, docs_architecture_test_architecture, docs_architecture_weight_layer [EXTRACTED 1.00]
- **扳機遲滯的跨環境狀態迴路** — claude_tripwire_hysteresis, claude_heartbeat, docs_architecture_heartbeat_loop, docs_architecture_heartbeat_fields, docs_architecture_monitor_self_push, docs_handover_unfinished [EXTRACTED 1.00]
- **公開 repo 衍生的紅線群** — claude_public_repo_warning, claude_never_auto_order, claude_monitor_never_touches_holdings, docs_architecture_red_lines, docs_handover_red_lines, docs_handover_changelog_outside_repo, claude_deployment_pages [INFERRED 0.95]
- **攔截層三面:入口 / 訂單 / 權重** — docs_audit_2026_10_14_checkinvariants, docs_audit_2026_10_14_orders_units_invariant_gap, docs_audit_2026_10_14_input_validation_gap, docs_audit_2026_10_14_weightsum_magic_fallback, docs_audit_2026_10_14_protection_asymmetry, docs_audit_2026_10_14_validatecontext_proposal [EXTRACTED 1.00]
- **無聲失敗家族(沉默與降級不可區分)** — docs_audit_2026_10_14_dead_mans_switch, docs_audit_2026_10_14_heartbeat_push_no_pull, docs_audit_2026_10_14_notification_loop_open, docs_audit_2026_10_14_stale_alert_title_churn, docs_ui_review_2026_11_03_silent_degradation, docs_ui_review_2026_11_03_normal_looking_error [INFERRED 0.85]
- **券商截圖匯入管道(OCR → 修補 → 解析 → 核對 → 套用)** — docs_ui_review_2026_11_03_ocr_broker_screenshot, docs_ui_review_2026_11_03_round2_ocr_psm6, docs_ui_review_2026_11_03_round2_dual_preprocessing, docs_ui_review_2026_11_03_fixocrcodes, docs_ui_review_2026_11_03_parsebrokerpaste, docs_ui_review_2026_11_03_quantity_price_crosscheck, docs_ui_review_2026_11_03_round2_cost_from_buy_price, docs_ui_review_2026_11_03_round2_diffholdings, docs_ui_review_2026_11_03_round2_applyparsed [EXTRACTED 1.00]

## Communities (31 total, 2 thin omitted)

### Community 0 - "引擎核心與估值"
Cohesion: 0.08
Nodes (49): advanceTier(), allocateCash(), auditWeights(), cashTWDAfter(), checkInvariants(), computeState(), costAfter(), derivedRisk() (+41 more)

### Community 1 - "網頁流程與狀態"
Cohesion: 0.06
Nodes (43): validateImport(), applyParsed() 寫入解析結果, applyPlan() 一鍵套用持倉, 開機流程 IIFE, btnExport 匯出 JSON 備份, btnParse 券商庫存解析與預覽, btnResetPeak 重設峰值與分層, DEFAULT_INST 預設六檔標的 (+35 more)

### Community 2 - "監控與工具腳本"
Cohesion: 0.05
Nodes (37): fs, out, path, payload, aliveAlert(), contractAlert(), DRILL, DRY (+29 more)

### Community 3 - "測試骨架與套件"
Cohesion: 0.07
Nodes (22): fs, path, R, INST, okSignal(), PRICES, scenario(), FS (+14 more)

### Community 4 - "每日監控排程"
Cohesion: 0.06
Nodes (32): runs-on, steps, concurrency, cancel-in-progress, group, default, description, type (+24 more)

### Community 5 - "凍結的平價參照"
Cohesion: 0.17
Nodes (32): applyPlan(), D_RETS, DEFAULT_INST, esc(), ESC_MAP, fetchAll(), fetchPx(), fin() (+24 more)

### Community 6 - "匯入正確性與假綠"
Cohesion: 0.09
Nodes (14): weightsSumToOne 寫好卻沒插上電, 【P1】2.3 weightSum 魔術數 0.8 fallback, fixOcrCodes 代碼修補, 券商庫存貼截圖(Tesseract.js 按需載入), 代碼結尾的 L 被認成 1(整列無聲消失), parseBrokerPaste 券商貼上解析, 損益率的負號掉了(六檔錯五檔), 成本為 0 時印出「+0.00%」(pnlOf) (+6 more)

### Community 7 - "CI 工作流"
Cohesion: 0.09
Nodes (22): concurrency, cancel-in-progress, group, jobs, test, name, on, pull_request (+14 more)

### Community 8 - "回測資料驗證"
Cohesion: 0.11
Nodes (15): all, cagr(), fs, hi, lo, lossProb(), path, path2000 (+7 more)

### Community 9 - "部署與單一真相"
Cohesion: 0.16
Nodes (8): CI 四道關卡, GitHub Pages 部署, CI 四道關卡與不跑契約測試, CRLF 與線上位元組驗證, 四個執行環境, index.html 四個頁面與 36 個函式, 模組地圖, 新電腦的環境需求

### Community 10 - "平價測試機制"
Cohesion: 0.15
Nodes (12): el(), fs, LEGACY, legacyPlan(), loadLegacy(), makeSandbox(), path, vm (+4 more)

### Community 11 - "稽核結論與精簡"
Cohesion: 0.14
Nodes (10): D_RETS 432 筆月報酬, parity.test.js 平價測試, 【P3】2.17 去蕪存菁候選, 壓測頁 † 三項無法重現的宣稱, 瀏覽器快取讓第一次線上驗證讀到舊檔, 死碼刪除(.cols/.empty/.mchip/--row-h/#cashCard/#lampSub), 五頁併成三頁(今日/持倉/設定), planHead(呈現層自己組的結論句) (+2 more)

### Community 12 - "扳機遲滯與心跳"
Cohesion: 0.19
Nodes (10): 每日監控, heartbeat.json 市場狀態心跳, 通知與不通知的分界, 00653L 扳機遲滯, monitor/check.js 11 個函式, heartbeat.json 欄位, 每日監控會自己 push, 通知矩陣 (+2 more)

### Community 13 - "紅線與專案治理"
Cohesion: 0.19
Nodes (11): 與 Codex 協作設計(未實施), 維護規則(2026-11-24 本人指定), mars-etf 2x 配置台, .notes/JOURNAL.md 工作日誌, 給接手 LLM 的入口指引, mars-etf 架構全圖, 七條紅線, git clone 帶不到的東西 (+3 more)

### Community 14 - "引擎分層與資料流"
Cohesion: 0.22
Nodes (11): Worker 網址存在 localStorage, 決策層, engine.js 37 個純函式與 UMD 包裝, 五道閘門表, live() 是「有效標的」的唯一定義, localStorage etf2x 持倉結構, Q:本次連線的市場資料, 狀態層 (+3 more)

### Community 15 - "已知行為與限制"
Cohesion: 0.27
Nodes (7): 成本優先用買入價×股數, fixOcrCodes 句點當 L 的混淆, dd 恰為 -35% 時遲滯提早鬆綁, 已知行為清單, 減碼略微超過 50% 上限, 匯入層, 已知限制表

### Community 16 - "參數與決策路徑"
Cohesion: 0.24
Nodes (10): 目標配置修正取到 0.1pp, engine.json 機器可讀規格, PARAMS 參數唯一真相, 與平價參照的刻意分歧, 三條決策路徑, PARAMS 完整表(engine.js:20-66), 與平價參照的刻意分歧(架構版), 這個系統在回答什麼 (+2 more)

### Community 17 - "版面量測與 CSS 陷阱"
Cohesion: 0.22
Nodes (8): CSS 同分覆蓋靠書寫順序, 22.9%% 雙百分號, 標的配置名稱欄被壓成碎片(.instrow), 版面掃描 5 寬度 × 4 頁 = 20 組,0 筆溢出, 首列五格在 1240px 以下互撞, 手機觸控目標過小(34px), 版面放大與首列三格, 第三部分 · 沒驗到的

### Community 18 - "外部相依與佚失件"
Cohesion: 0.31
Nodes (5): Cloudflare Worker 外部相依, D_RETS 回測資料集, 佚失的 STEP 3b Python 回測引擎, 三項無法重現的宣稱, 訊號與驗證層

### Community 19 - "安全設計與防線"
Cohesion: 0.27
Nodes (4): 五道閘門 gateReasons, 安全設計對照表(沒有它會怎樣), 測試架構 282 項, 三步開工

### Community 20 - "不變量與入口驗證"
Cohesion: 0.32
Nodes (8): checkInvariants 攔截層, fetchAll 八請求並行與三段 fallback, makePlan 三條決策路徑, 月度檢查資料流, 【P3】2.14 離線即停機(重構引入的回歸), 【P1】2.1 不變量不檢查 orders↔units 自洽, 第三部分 · 四階段規劃, validateContext(ctx) 入口驗證提案

### Community 21 - "契約測試與排程"
Cohesion: 0.29
Nodes (4): contract.test.js 資料契約測試, 【P2】2.6 排程延遲中位 5 小時, 每日監控 daily-monitor.yml, 00653L 出場扳機(Brent>90 且 USD/INR>96)

### Community 22 - "峰值與分層狀態"
Cohesion: 0.43
Nodes (4): advanceTier(峰值與分層推進), 【P1】2.2 輸入側零驗證(不變量只守出口), 持久化狀態 S.peak 與 S.tierTc, 歸零造出的假回撤(dd 0% → -13.5%)

### Community 23 - "重複實作與參數漂移"
Cohesion: 0.33
Nodes (6): 【P3】2.11 applyPlan 現金四捨五入到千元且無聲下限為 0, CI 四道關卡, engine.json 機器可讀規格(零消費端), 【P3】2.10 index.html 369 行 glue 零自動化測試, 【P3】2.9 index.html 重新實作引擎公式 4 處, 最小交易門檻兩個值(0.002 vs 0.005)

### Community 24 - "通知閉環與資料新鮮度"
Cohesion: 0.29
Nodes (5): 【P2】2.7 通知迴圈沒有閉環, 單腿武裝 / 接近觸發預警(缺少的功能), 【P3】2.16 過期警報每天換標題 → 每天一個新 Issue, 【P2】2.4 扳機沒有遲滯(已在實際抖動), openDaysBehind(只數交易日)

### Community 25 - "信任邊界"
Cohesion: 0.33
Nodes (4): 五道閘門(blockers), Cloudflare Worker(半信任資料源), 【P3】2.13 匯入可覆寫 worker 位址, 資料新鮮度改講「· 4 天前」

### Community 26 - "沉默失效與防護不對稱"
Cohesion: 0.33
Nodes (4): 【P2】2.8 沉默不可區分 —— 沒有死人開關, 【P3】2.15 心跳推送沒有先 pull, 【P3】2.12「整數化後無需交易」訊息不準確, 小權重標的的死區(數學上存在,實務可忽略)

### Community 27 - "架構定位與參數歸屬"
Cohesion: 0.40
Nodes (3): golden.test.js 黃金案例, PARAMS(策略參數唯一真相), 【P2】2.5 扳機門檻不在 PARAMS

### Community 28 - "加碼試算與閘門補強"
Cohesion: 0.40
Nodes (4): allocateCash 加碼分配, 加碼試算完全沒有閘門(btnAdd), EG.gateReasons(閘門移進引擎), capNow()(持股市值 + 現金)

## Ambiguous Edges - Review These
- `render() 全頁重繪` → `tierTarget() 分層目標包裝`  [AMBIGUOUS]
  index.html · relation: conceptually_related_to
- `dRets() 回測月報酬載入` → `data terminal 版面風格`  [AMBIGUOUS]
  index.html · relation: conceptually_related_to
- `mars-etf 架構全圖` → `現在停在哪裡`  [AMBIGUOUS]
  docs/HANDOVER.md · relation: conceptually_related_to

## Knowledge Gaps
- **25 isolated node(s):** `DEFAULT_INST 預設六檔標的`, `ESC_MAP 跳脫對照表`, `toast() 短訊`, `go() 頁籤切換`, `TESS_SRC tesseract.js CDN 位址` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 163 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render() 全頁重繪` connect `引擎核心與估值` to `網頁流程與狀態`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `live()` (e.g. with `engine.js` and `hasId()`) actually correct?**
  _`live()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `DEFAULT_INST 預設六檔標的`, `ESC_MAP 跳脫對照表`, `toast() 短訊` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `引擎核心與估值` be split into smaller, more focused modules?**
  _Cohesion score 0.08246753246753247 - nodes in this community are weakly interconnected._
- **Why does `btnAuto 依目標配置自動分配` connect `引擎核心與估值` to `網頁流程與狀態`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._

### Low-confidence Hints
_AMBIGUOUS edges — the extractor was unsure. Verify before acting on these._

- **What is the exact relationship between `render() 全頁重繪` and `tierTarget() 分層目標包裝`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `dRets() 回測月報酬載入` and `data terminal 版面風格`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
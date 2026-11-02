/**
 * 三層攻守引擎 — 共用決策核心(單一真相)
 *
 * 這個模組是純函式:不碰 DOM、不發網路請求、不讀 localStorage。
 * 三個消費端共用同一份邏輯:
 *   1. PWA (index.html)      — 使用者操作介面
 *   2. 每日監控 (GitHub Actions) — 例外才通知
 *   3. 測試套件 (test/)       — 驗證前兩者
 *
 * 參數以本檔的 PARAMS 為唯一真相;engine.json 由 dump-params.js 產生,
 * 供非 JavaScript 的消費端(回測 Python)讀取,請勿手動編輯該檔。
 *
 * 瀏覽器:以 <script src> 載入後掛在 window.ETFEngine
 * Node  :require("./engine/engine.js")
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ETFEngine = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* ── 參數 ────────────────────────────────────────────────────────────
     BASE  基準現金水位
     DEF   風險期防禦現金水位
     CAP   單次減碼上限(佔持股比例)
     T30   首撥門檻(回撤)
     DRIFT 容忍帶(相對目標權重)
     PREM  溢價警告門檻 %
     STALE 市場資料可接受的最大延遲天數
     LADDER 分層抄底階梯 [[回撤門檻, 現金目標], ...] 必須由深到淺排列
     REARM  回補遲滯:回升需超過門檻 + REARM 才鬆綁,避免在門檻上來回跳
     VIX_THRESHOLD / SMA_MONTHS 風險旗標的判定條件,
       與 Worker 的 /signal 一致,用於獨立複核伺服器端的判斷
     TRIP_BRENT / TRIP_USDINR 00653L 出場扳機的兩個門檻,同樣用於複核
  ─────────────────────────────────────────────────────────────────── */
  var PARAMS = {
    BASE: 0.20,
    DEF: 0.50,
    CAP: 0.50,
    T30: -0.30,
    DRIFT: 0.25,
    PREM: 1.0,
    STALE: 4,
    LADDER: [[-0.50, 0.05], [-0.40, 0.10]],
    REARM: 0.05,
    VIX_THRESHOLD: 32,
    SMA_MONTHS: 12,
    /* 00653L 扳機門檻。權威計算在 Worker(原始碼不在本 repo),
       這裡放一份是為了讓三個顯示處不再各自寫死數字;
       兩邊是否一致由 contract.test.js 以 tripwireArmed 複核,不一致即紅燈。 */
    TRIP_BRENT: 90,
    TRIP_USDINR: 96,
    /* 再平衡下單門檻:變動金額低於總值這個比例就不動(避免碎單) */
    MIN_TRADE_FRACTION: 0.005,
    /* 現金偏離判定時給的容差,對應 makePlan 的 cf < DEF - EPS */
    CASH_EPS: 0.001
  };

  /* ── 基礎判斷 ─────────────────────────────────────────────────── */

  /** 正數且有限。價格、匯率一律用這個把關 */
  function isPos(x) { return Number.isFinite(x) && x > 0; }

  /** null 與 "" 用 + 轉型都會變成 0 並通過 Number.isFinite,必須先擋掉 */
  function numOk(x) { return x != null && x !== "" && Number.isFinite(+x); }

  /** 有填代碼才算一檔真實標的。空白列不抓價、不佔權重、不擋月檢 */
  function hasId(x) { return !!(x && x.id && String(x.id).trim()); }

  /** 從標的清單取出有效標的 */
  function live(inst) { return (Array.isArray(inst) ? inst : []).filter(hasId); }

  /**
   * 目標權重總和。標的的 tgt 是「相對權重」,實際目標需除以此總和正規化。
   * 空白列不計入——否則真實標的會被等比稀釋,等於有資金被永遠買不到的標的佔住。
   *
   * 可能回傳 0(全部權重為 0)。呼叫端必須先擋下,不可直接當分母——
   * 原本這裡退回預設值 0.8 以免除以零,但那只是讓每檔目標都算成 0,
   * 結果是「建議清倉」且所有不變量都通過。掩蓋錯誤比爆掉更危險。
   */
  function weightSum(inst) {
    var t = 0;
    live(inst).forEach(function (i) { t += (+i.tgt || 0); });
    return t;
  }

  /** 單一標的的目標權重(佔總資產),已扣除現金水位並正規化 */
  function targetWeight(i, tc, inst) {
    return (1 - tc) * (+i.tgt || 0) / weightSum(inst);
  }

  /**
   * 權重是否超出容忍帶。makePlan 的動作判定與 PWA 持倉卡的 ⚠ 標記
   * 必須是同一條規則——原本兩邊各寫一次,改 DRIFT 只會改到一邊。
   */
  function offBand(w, tg, P) {
    P = P || PARAMS;
    return Math.abs(w - tg) > P.DRIFT * tg;
  }

  /* ── 估值 ─────────────────────────────────────────────────────── */

  /** 標的報價換算為台幣。美股標的需要匯率,取不到即視為無報價 */
  function priceTWD(i, prices, fx) {
    var p = prices ? prices[i.id] : null;
    if (!isPos(p)) return null;
    return i.src === "us" ? (isPos(fx) ? p * fx : null) : p;
  }

  /** 標的持倉市值(台幣) */
  function valueTWD(i, units, prices, fx) {
    var pt = priceTWD(i, prices, fx);
    if (pt == null) return null;
    var r = ((units && units[i.id]) || 0) * pt;
    return Number.isFinite(r) ? r : null;
  }

  /**
   * 組合估值。
   * miss 為真代表「有持股但拿不到報價」——此時所有金額都不可信,
   * 呼叫端必須中止,不可更新峰值與分層狀態。
   */
  function totals(ctx) {
    var units = ctx.units || {}, inv = 0, miss = false;
    live(ctx.inst).forEach(function (i) {
      var v = valueTWD(i, units, ctx.prices, ctx.fx);
      if (v == null) { if ((units[i.id] || 0) > 0) miss = true; return; }
      inv += v;
    });
    var cash = (ctx.cashTWD || 0) + ((ctx.cashUSD || 0) * (isPos(ctx.fx) ? ctx.fx : 0));
    return { inv: inv, cash: cash, V: inv + cash, miss: miss };
  }

  /* ── 分層抄底階梯 ─────────────────────────────────────────────── */

  /**
   * 依回撤決定目標現金水位,含回補遲滯。
   * @param dd   目前回撤(負值,例如 -0.42)
   * @param prev 上一次的目標現金水位
   */
  function tierTarget(dd, prev, P) {
    P = P || PARAMS;
    var want = P.BASE;
    for (var k = 0; k < P.LADDER.length; k++) {
      if (dd <= P.LADDER[k][0]) { want = P.LADDER[k][1]; break; }
    }
    /* want > prev 代表要「鬆綁」回較高的現金水位。
       此時要求回撤必須明顯改善(超過原門檻 + REARM)才放行,
       否則在門檻上下抖動會造成反覆進出。 */
    if (want > prev) {
      var cur = null;
      for (var j = 0; j < P.LADDER.length; j++) {
        if (P.LADDER[j][1] === prev) { cur = P.LADDER[j]; break; }
      }
      if (cur && dd <= cur[0] + P.REARM) return prev;
    }
    return want;
  }

  /* ── Worker 訊號驗證 ──────────────────────────────────────────── */

  /**
   * 驗證 /signal 回應。回傳 null 代表通過,否則回傳原因字串。
   *
   * 整套策略的安全性都掛在 risk_flag 上。欄位缺漏時絕不可當成「沒有風險」,
   * 一律 fail closed:實測缺 risk_flag 的回應會讓 SPX 破線 + VIX 48 的
   * 崩盤盤面顯示成正常期,並建議加碼。
   */
  function validateSignal(s) {
    if (!s || typeof s !== "object" || Array.isArray(s)) return "Worker /signal 回應格式錯誤";
    if (s.risk_flag == null) return "回應缺少風險旗標 risk_flag";
    if (!s.spx || !numOk(s.spx.last) || !numOk(s.spx.sma12m) || +s.spx.sma12m <= 0) return "SPX 資料缺漏或無效";
    if (!s.vix || !numOk(s.vix.last)) return "VIX 資料缺漏或無效";
    if (!s.asof || !s.asof.spx) return "回應缺少資料日期 asof.spx";
    return null;
  }

  /**
   * 由原始指標獨立重算風險旗標,不看 s.risk_flag。
   * 用於複核 Worker 的伺服器端判斷——兩者不一致代表某一邊有問題。
   */
  function derivedRisk(s, P) {
    P = P || PARAMS;
    if (validateSignal(s)) return null;          // 資料不足以判斷
    return (+s.spx.last < +s.spx.sma12m) || (+s.vix.last > P.VIX_THRESHOLD);
  }

  /** Worker 的 risk_flag 與本地重算是否相符 */
  function riskAgrees(s, P) {
    var d = derivedRisk(s, P);
    if (d === null) return null;
    return !!s.risk_flag === d;
  }

  /**
   * 由原始油價與匯率獨立重算 00653L 扳機,不看 s.tripwire.armed。
   * 回傳 null 代表資料不足以判斷。與 derivedRisk 同一個用途:
   * 門檻搬進 PARAMS 之後,必須有人盯著 Worker 有沒有跟著一致。
   */
  function tripwireArmed(s, P) {
    P = P || PARAMS;
    var t = s && s.tripwire;
    if (!t || !numOk(t.brent) || !numOk(t.usdinr)) return null;
    return +t.brent > P.TRIP_BRENT && +t.usdinr > P.TRIP_USDINR;
  }

  /**
   * 驗證匯入的狀態檔。回傳 null 代表通過,否則回傳拒絕原因字串。
   *
   * 匯入是這個 App 唯一的不信任輸入——它整份覆蓋 localStorage。
   * 刻意「拒絕」而非「自動夾取」:悄悄把 -500 股修成 0,會讓一份損壞的備份
   * 繼續產生看起來正常的投資建議,使用者永遠不知道資料壞過。
   * 實測負股數會造出 -70% 的假回撤,觸發分層抄底最深一格,並寫進峰值永久污染。
   *
   * (設定頁即時輸入的數字由 readUI 夾取,那是當下的輸入,不是損壞的檔案。)
   */
  function validateImport(o) {
    if (!o || typeof o !== "object" || Array.isArray(o)) return "最外層必須是一個物件";
    if (o.units != null) {
      if (typeof o.units !== "object" || Array.isArray(o.units)) return "units 必須是物件";
      for (var k in o.units) {
        if (!Number.isInteger(o.units[k]) || o.units[k] < 0) {
          return "持股必須是非負整數:" + k + " = " + o.units[k];
        }
      }
    }
    var nonNeg = ["peak", "cashTWD", "cashUSD", "cap"];
    for (var n = 0; n < nonNeg.length; n++) {
      var v = o[nonNeg[n]];
      if (v != null && !(Number.isFinite(v) && v >= 0)) return nonNeg[n] + " 必須是非負數:" + v;
    }
    if (o.tierTc != null) {
      var lo = PARAMS.LADDER.reduce(function (m, a) { return Math.min(m, a[1]); }, PARAMS.BASE);
      var hi = Math.max(PARAMS.BASE, PARAMS.DEF);
      if (!(Number.isFinite(o.tierTc) && o.tierTc >= lo && o.tierTc <= hi)) {
        return "tierTc 必須落在 [" + lo + ", " + hi + "]:" + o.tierTc;
      }
    }
    return null;
  }

  /** 市場資料延遲天數。today 為 YYYY-MM-DD 字串 */
  function staleDays(s, today) {
    if (!s || !s.asof || !s.asof.spx) return Infinity;
    var d = Math.floor((Date.parse(today) - Date.parse(s.asof.spx)) / 864e5);
    return Number.isFinite(d) ? d : Infinity;
  }

  /**
   * 月檢閘門:回傳中止原因清單(空陣列 = 可繼續)。
   *
   * 這是規格裡「任一觸發即中止,且不更新峰值與分層狀態」的那份清單。
   * 它原本只存在於 index.html 的 runCheck 裡,是決策邏輯卻零測試覆蓋。
   * 回傳純文字,跳脫交給呈現層——標的代碼可由匯入檔控制,必須跳脫。
   *
   * @param ctx    {inst, prices, fx}
   * @param signal Worker /signal 回應
   * @param today  YYYY-MM-DD(台北)
   */
  function gateReasons(ctx, signal, today, P) {
    P = P || PARAMS;
    var out = [], list = live(ctx.inst);
    var sigErr = validateSignal(signal);
    if (sigErr) out.push("市場訊號無效:" + sigErr);
    if (!list.length) out.push("尚未設定任何標的(請至設定頁填入代碼)");
    var missing = list.filter(function (i) {
      return !isPos(ctx.prices ? ctx.prices[i.id] : null);
    }).map(function (i) { return i.id; });
    if (missing.length) out.push("報價缺失:" + missing.join("、"));
    var stale = staleDays(signal, today);
    if (stale > P.STALE) {
      out.push(Number.isFinite(stale)
        ? "市場資料過期 " + stale + " 天(asof " + signal.asof.spx + ")"
        : "市場資料沒有日期,無法判斷是否過期");
    }
    if (!isPos(ctx.fx)) out.push("匯率無效");
    return out;
  }

  /**
   * 「一鍵套用持倉」後該記錄的台幣現金:計畫現金扣掉美元現金的台幣值。
   *
   * 回傳 null 代表算不出來——美元現金的台幣值超過整份計畫的現金,
   * 代表設定頁的現金欄位與實際不符。原本外層包 Math.max(0, ...),
   * 這種情形會被無聲歸零:總資產憑空蒸發,而且會寫進峰值污染之後的回撤。
   *
   * 千元粒度是刻意的,與設定頁以萬元為單位的輸入欄一致。
   */
  function cashTWDAfter(planCash, cashUSD, fx) {
    var twd = planCash - (cashUSD || 0) * (isPos(fx) ? fx : 0);
    if (!(twd >= 0)) return null;
    return Math.round(twd / 1000) * 1000;
  }

  /* ── 狀態 ─────────────────────────────────────────────────────── */

  /**
   * 峰值與分層推進。只有在資料完整可信時才可呼叫——
   * 報價缺失或匯率無效時推進峰值會把錯誤的低估值記成新峰值。
   *
   * @param V     目前組合總值
   * @param prior {peak, tierTc}
   * @returns {peak, tierTc}
   */
  function advanceTier(V, prior, P) {
    P = P || PARAMS;
    var peak = prior.peak, tierTc = prior.tierTc;
    if (V >= peak) { peak = V; tierTc = P.BASE; }
    var dd = peak ? V / peak - 1 : 0;
    return { peak: peak, tierTc: tierTarget(dd, tierTc, P) };
  }

  /**
   * 由持倉與訊號算出決策所需的狀態。
   *
   * @param ctx   {inst, units, prices, fx, cashTWD, cashUSD}
   * @param prior {peak, tierTc, signal}
   */
  function computeState(ctx, prior, P) {
    P = P || PARAMS;
    var t = totals(ctx);
    var V = t.V, cash = t.cash;
    var dd = (prior.peak && isPos(V)) ? V / prior.peak - 1 : 0;
    return {
      V: V, cash: cash,
      cf: V ? cash / V : 0,
      tc: prior.tierTc,
      dd: dd,
      risk: prior.signal ? prior.signal.risk_flag : undefined,
      miss: t.miss
    };
  }

  /* ── 決策 ─────────────────────────────────────────────────────── */

  /**
   * 產生本期行動計畫。純函式,回傳結構化資料,格式化交給呈現層。
   *
   * @param ctx {inst, units, prem, prices, fx}
   * @param st  {V, cash, cf, tc, dd, risk}
   * @returns {kind:"hold", message}
   *        | {kind:"trim"|"rebalance", orders, units, cash, ...}
   */
  function makePlan(ctx, st, P) {
    P = P || PARAMS;
    var V = st.V, cash = st.cash, cf = st.cf, tc = st.tc, dd = st.dd;
    var units0 = ctx.units || {}, prem = ctx.prem || {};
    var list = live(ctx.inst);

    /* 權重合計為 0 無法推算配置。不可讓它往下跑——見 weightSum 的註解。
       「沒有任何標的」是另一回事(呼叫端的閘門會先擋),行為維持原樣。 */
    if (list.length && !(weightSum(ctx.inst) > 0)) {
      return { kind: "hold", message: "各標的的目標權重合計為 0——請至設定頁填入目標權重。本期不產生任何建議" };
    }

    /* ── 風險期:凍結投入,只允許減碼 ── */
    if (st.risk) {
      if (cf < P.DEF - P.CASH_EPS) {
        var hold = V - cash;
        /* 空手時 hold 為 0,sell/hold 會產生 NaN 並一路寫進持股與現金
           (JSON 序列化後變成 null)。沒有持股就沒有減碼的餘地。 */
        if (!(hold > 0)) {
          return { kind: "hold", message: "風險期且目前無持股可減——維持空手等待旗標熄滅" };
        }
        var sell = Math.min(P.DEF * V - cash, P.CAP * hold);
        var tUnits = {}, tOrders = [], tAfter = 0;
        list.forEach(function (i) {
          var pt = priceTWD(i, ctx.prices, ctx.fx), cur = units0[i.id] || 0;
          if (pt == null) { tUnits[i.id] = cur; return; }
          var nu = Math.floor(cur * (1 - sell / hold));
          tUnits[i.id] = nu; tAfter += nu * pt;
          if (cur - nu > 0) {
            tOrders.push({ id: i.id, side: "sell", shares: cur - nu, amount: (cur - nu) * pt, warn: null });
          }
        });
        return {
          kind: "trim", orders: tOrders, units: tUnits, cash: V - tAfter,
          targetCash: P.DEF, capFraction: P.CAP
        };
      }
      return { kind: "hold", message: "風險期且現金已達防禦水位——空手等待旗標熄滅,不投入、不再平衡" };
    }

    /* ── 正常期:判斷是否需要動作 ── */
    var act = (dd <= P.T30 && cf > tc * 1.05) || Math.abs(cf - tc) > P.DRIFT * tc;
    list.forEach(function (i) {
      var v = valueTWD(i, units0, ctx.prices, ctx.fx);
      if (v == null) return;
      var w = v / V, tg = targetWeight(i, tc, ctx.inst);
      if (offBand(w, tg, P)) act = true;
    });
    if (!act) {
      return { kind: "hold", message: "全部在容忍帶內——本月無動作。論點檢核:逐檔確認否證條件未觸發即續抱" };
    }

    var units = {}, orders = [], after = 0;
    list.forEach(function (i) {
      var pt = priceTWD(i, ctx.prices, ctx.fx), cur = units0[i.id] || 0;
      if (pt == null) { units[i.id] = cur; return; }
      var nu = Math.floor(targetWeight(i, tc, ctx.inst) * V / pt);
      /* 變動金額太小就不動,避免每月產生無意義的碎單 */
      if (Math.abs(nu - cur) * pt < V * P.MIN_TRADE_FRACTION) nu = cur;
      units[i.id] = nu; after += nu * pt;
      if (nu !== cur) {
        var du = nu - cur;
        orders.push({
          id: i.id, side: du > 0 ? "buy" : "sell",
          shares: Math.abs(du), amount: Math.abs(du) * pt,
          warn: ((prem[i.id] || 0) > P.PREM && du > 0) ? "premium" : null
        });
      }
    });
    if (!orders.length) return { kind: "hold", message: "整數化後無需交易——本月無動作" };
    return {
      kind: "rebalance", orders: orders, units: units, cash: V - after,
      targetCash: tc, tieredBuy: dd <= P.T30, dd: dd
    };
  }

  /* ── 不變量 ───────────────────────────────────────────────────
     任何計畫都必須滿足這些條件。違反代表引擎有 bug,呼叫端應中止。
  ─────────────────────────────────────────────────────────────── */

  /**
   * 檢查計畫的不變量,回傳違反項目的陣列(空陣列 = 通過)。
   * @param plan makePlan 的輸出
   * @param ctx  同 makePlan 的 ctx
   * @param st   同 makePlan 的 st
   */
  function checkInvariants(plan, ctx, st, P) {
    P = P || PARAMS;
    var bad = [];
    if (!plan || plan.kind === "hold") return bad;

    /* 股數必須是非負整數 */
    Object.keys(plan.units).forEach(function (k) {
      var u = plan.units[k];
      if (!Number.isFinite(u)) bad.push("股數非有限數:" + k + "=" + u);
      else if (u < 0) bad.push("股數為負:" + k + "=" + u);
      else if (!Number.isInteger(u)) bad.push("股數非整數:" + k + "=" + u);
    });

    /* 現金必須是有限非負數 */
    if (!Number.isFinite(plan.cash)) bad.push("現金非有限數:" + plan.cash);
    else if (plan.cash < -1) bad.push("現金為負:" + plan.cash);

    /* 現金守恆:計畫執行後 Σ持股 + 現金 應等於總資產(容差 1 元) */
    var after = 0;
    live(ctx.inst).forEach(function (i) {
      var pt = priceTWD(i, ctx.prices, ctx.fx);
      if (pt != null) after += (plan.units[i.id] || 0) * pt;
    });
    if (Number.isFinite(st.V) && Number.isFinite(plan.cash)) {
      var diff = Math.abs(after + plan.cash - st.V);
      if (diff > 1) bad.push("現金不守恆:Σ持股 " + after.toFixed(2) + " + 現金 " + plan.cash.toFixed(2) + " ≠ 總值 " + st.V.toFixed(2) + "(差 " + diff.toFixed(2) + ")");
    }

    /* 目標現金水位必須落在階梯定義的範圍內 */
    if (plan.targetCash != null) {
      var lo = P.LADDER.reduce(function (m, a) { return Math.min(m, a[1]); }, P.BASE);
      var hi = Math.max(P.BASE, P.DEF);
      if (!(plan.targetCash >= lo - 1e-9 && plan.targetCash <= hi + 1e-9)) {
        bad.push("目標現金 " + plan.targetCash + " 超出 [" + lo + ", " + hi + "]");
      }
    }

    /* 風險期不得有買單 */
    if (st.risk && plan.orders.some(function (o) { return o.side === "buy"; })) {
      bad.push("風險期出現買單——凍結投入規格被違反");
    }

    /* 訂單與持股必須自洽。
       計畫裡有兩份資料:orders 是使用者拿去券商執行的,units 是 App 事後記錄的。
       原本只驗 units,於是訂單方向反轉、股數爆增都能通行——而人照著訂單下單。
       兩者分歧會讓實際部位與紀錄無聲走偏,下個月的計算又以錯的紀錄為基礎。

       注意這檢查的是「計畫自身的兩種表述是否一致」,不是券商成交結果。
       部分成交/未成交由使用者在設定頁校正持有數,那是另一條既有的路徑。 */
    var u0 = ctx.units || {}, inOrder = {};
    plan.orders.forEach(function (o) {
      inOrder[o.id] = true;
      var moved = (plan.units[o.id] || 0) - (u0[o.id] || 0);
      var want = o.side === "buy" ? o.shares : -o.shares;
      if (moved !== want) {
        bad.push("訂單與持股不符:" + o.id + " 訂單為 " + o.side + " " + o.shares
          + " 股,但持股變動 " + moved + " 股");
      }
    });
    live(ctx.inst).forEach(function (i) {
      if (!inOrder[i.id] && (plan.units[i.id] || 0) !== (u0[i.id] || 0)) {
        bad.push("無訂單卻變動持股:" + i.id + " " + (u0[i.id] || 0) + " → " + plan.units[i.id]);
      }
    });

    /* 這裡刻意沒有「權重合計為 1」的檢查。
       weightsSumToOne 看似是一道防線,實際上是恆真式:
         Σ targetWeight = (1-tc) * Σtgt/Σtgt = 1-tc,加上 tc 恆為 1。
       唯一會是 false 的情況是 Σtgt = 0(含正負互相抵銷)導致 NaN,
       而那個情況 makePlan 開頭的閘門已經擋掉了。
       接進來只會多一行永遠不會觸發的程式碼——突變測試證實移除它不會讓任何測試變紅。
       它留在 invariant.test.js 當作「正規化後合計為 1」這個性質的可讀斷言。 */

    /* 減碼不得超過持股的 CAP。
       股數必須整數化,nu = floor(cur*(1-r)) 一律向下取整,
       因此實際賣出會略多於精算值——每檔最多多賣不到 1 股。
       允許的溢出上限即為「每檔一股股價」的總和。 */
    if (plan.kind === "trim") {
      var sold = plan.orders.reduce(function (s, o) { return s + o.amount; }, 0);
      var holdV = st.V - st.cash;
      var roundingSlack = 0;
      live(ctx.inst).forEach(function (i) {
        var pt = priceTWD(i, ctx.prices, ctx.fx);
        if (pt != null) roundingSlack += pt;
      });
      if (holdV > 0 && sold > P.CAP * holdV + roundingSlack + 1) {
        bad.push("單次減碼 " + sold.toFixed(0) + " 超過持股 " + (P.CAP * 100) + "% 上限 "
          + (P.CAP * holdV).toFixed(0) + "(含取整寬容 " + roundingSlack.toFixed(0) + ")");
      }
    }
    return bad;
  }

  /** 目標權重合計是否為 1(現金 + 各標的) */
  function weightsSumToOne(inst, tc) {
    var s = tc;
    live(inst).forEach(function (i) { s += targetWeight(i, tc, inst); });
    return Math.abs(s - 1) < 1e-9;
  }

  return {
    PARAMS: PARAMS,
    isPos: isPos, numOk: numOk, hasId: hasId, live: live,
    weightSum: weightSum, targetWeight: targetWeight, weightsSumToOne: weightsSumToOne,
    offBand: offBand,
    priceTWD: priceTWD, valueTWD: valueTWD, totals: totals,
    tierTarget: tierTarget, advanceTier: advanceTier, computeState: computeState,
    validateSignal: validateSignal, derivedRisk: derivedRisk, riskAgrees: riskAgrees,
    validateImport: validateImport, staleDays: staleDays,
    tripwireArmed: tripwireArmed, gateReasons: gateReasons, cashTWDAfter: cashTWDAfter,
    makePlan: makePlan, checkInvariants: checkInvariants
  };
});

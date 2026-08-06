/**
 * D_RETS 資料集驗證。
 *
 * 產生 D_RETS 的回測引擎(STEP 3b)已佚失,無法重跑。
 * 但資料本身還在,壓測頁上的宣稱可以直接對資料查證。
 *
 * 這組測試的用途有二:
 *   1. 釘住「可重現」的宣稱——D_RETS 若被誤改,這裡會先叫。
 *   2. 明文記錄「不可重現」的宣稱與原因,避免日後有人以為那是 bug。
 */
"use strict";
const { describe, it } = require("./harness.js");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const R = html.match(/const D_RETS=\[([^\]]+)\]/)[1].split(",").map(Number);

/* 註解宣稱 1990-07~2026-07 共 432 筆。相隔 432 個月、含頭含尾應為 433 筆,
   故以 index 0 = 1990-07、index 431 = 2026-06 解讀。 */
const idx = (y, mo) => (y * 12 + mo - 1) - (1990 * 12 + 6);

function stats(slice) {
  let v = 1, peak = 1, mdd = 0;
  slice.forEach(r => { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
  return { growth: v, months: slice.length, cagr: Math.pow(v, 12 / slice.length) - 1, mdd };
}

describe("資料集 · D_RETS 完整性", () => {
  it("432 筆、無 NaN、數值落在合理範圍", (a) => {
    a.strictEqual(R.length, 432);
    a.ok(!R.some(Number.isNaN), "不得含 NaN");
    a.ok(Math.min(...R) > -0.5 && Math.max(...R) < 0.5,
      `月報酬應在 ±50% 內,實際 ${Math.min(...R)} ~ ${Math.max(...R)}`);
  });
});

describe("資料集 · 可重現的宣稱(壓測頁標示 ✓)", () => {
  const all = stats(R);

  it("全期 CAGR 15.2%", (a) => {
    a.ok(Math.abs(all.cagr - 0.152) < 0.003,
      `實測 ${(all.cagr * 100).toFixed(2)}%,壓測頁宣稱 15.2%`);
  });

  it("全期 MaxDD -62.6%", (a) => {
    a.ok(Math.abs(all.mdd + 0.626) < 0.003,
      `實測 ${(all.mdd * 100).toFixed(2)}%,壓測頁宣稱 -62.6%`);
  });

  it("2015 年起 CAGR 約 18–20%", (a) => {
    const s = stats(R.slice(idx(2015, 1)));
    a.ok(s.cagr > 0.17 && s.cagr < 0.21,
      `實測 ${(s.cagr * 100).toFixed(1)}%,壓測頁宣稱「~20%」(偏低 1.7pp,在約略範圍內)`);
  });

  it("2015 年起 MaxDD 約 -35%", (a) => {
    const s = stats(R.slice(idx(2015, 1)));
    a.ok(Math.abs(s.mdd + 0.36) < 0.03,
      `實測 ${(s.mdd * 100).toFixed(1)}%,壓測頁宣稱 -36%`);
  });
});

describe("資料集 · 不可重現的宣稱(壓測頁標示 †)", () => {
  it("任何起點的回撤都不可能超過全期最大回撤——所以 -80% 必來自別的資料頻率", (a) => {
    /* 子區間的峰谷配對是全區間的子集,故子區間 MaxDD 不可能更深。
       這是數學事實,不是資料問題:月頻的 D_RETS 永遠算不出 -80%。
       月底取樣看不到月中低點,原始回測若為日頻,-80% 與 -62.6% 可同時成立。 */
    const full = stats(R).mdd;
    let deepest = 0;
    for (let s = 0; s < R.length - 120; s++) {
      deepest = Math.min(deepest, stats(R.slice(s)).mdd);
    }
    a.ok(deepest >= full - 1e-12,
      "子區間回撤不應深於全期");
    a.ok(deepest > -0.80,
      `掃過所有起點,最深僅 ${(deepest * 100).toFixed(1)}%,無法達到壓測頁宣稱的 -80%`);
  });

  it("2000-03 起算的成長倍數與宣稱的 1.09x 不符", (a) => {
    let v = 1;
    for (let k = idx(2000, 3); k < R.length; k++) v *= 1 + R[k];
    const at138 = (() => {
      let x = 1; const end = idx(2000, 3) + Math.round(13.8 * 12);
      for (let k = idx(2000, 3); k < Math.min(end, R.length); k++) x *= 1 + R[k];
      return x;
    })();
    /* 明文記錄實測值。日後若有人「修好」這個差異,代表資料或解讀改變了,
       應該重新檢視而不是讓測試靜靜通過。 */
    a.ok(at138 > 1.5,
      `實測 13.8 年為 ${at138.toFixed(2)}x,壓測頁宣稱 1.09x——差異來自已佚失的原始回測`);
  });

  it("4 年虧損機率實測穩定落在 11–12%,低於宣稱的 ~13%", (a) => {
    const H = 48, B = 12;
    const run = seed => {
      let s = seed >>> 0;
      const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
      let loss = 0, N = 20000;
      for (let p = 0; p < N; p++) {
        let v = 1, n = 0;
        while (n < H) {
          const st = Math.floor(rand() * (R.length - B + 1));
          for (let k = 0; k < B && n < H; k++, n++) v *= 1 + R[st + k];
        }
        if (v < 1) loss++;
      }
      return loss / N;
    };
    const probs = [1000, 2000, 3000].map(run);
    const lo = Math.min(...probs), hi = Math.max(...probs);
    a.ok(hi - lo < 0.01, `五組種子間應穩定,實際 ${(lo * 100).toFixed(1)}%~${(hi * 100).toFixed(1)}%`);
    a.ok(lo > 0.10 && hi < 0.13,
      `實測 ${(lo * 100).toFixed(1)}%~${(hi * 100).toFixed(1)}%,壓測頁宣稱 ~13%——`
      + "區間穩定代表是方法論差異(區塊長度、重疊與否)而非隨機誤差");
  });
});

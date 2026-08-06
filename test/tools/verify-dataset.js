#!/usr/bin/env node
/**
 * 驗證 D_RETS 與壓測頁上宣稱的數字是否相符。
 *
 * 產生 D_RETS 的回測引擎已佚失,但資料本身還在。
 * 這支工具不重建引擎——它直接檢查「資料是否支持頁面上的宣稱」,
 * 把無從查證的斷言轉成可驗證的事實。
 *
 *   node test/tools/verify-dataset.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
const m = html.match(/const D_RETS=\[([^\]]+)\]/);
if (!m) { console.error("找不到 D_RETS"); process.exit(1); }
const R = m[1].split(",").map(Number);

/* 註解宣稱 1990-07~2026-07 共 432 筆。1990-07 到 2026-07 相隔 432 個月,
   含頭含尾應為 433 筆,故此處以 index 0 = 1990-07、index 431 = 2026-06 解讀。 */
const START_Y = 1990, START_M = 7;
const label = k => {
  const t = (START_Y * 12 + (START_M - 1)) + k;
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, "0")}`;
};
const idx = (y, mo) => (y * 12 + mo - 1) - (START_Y * 12 + START_M - 1);

const pct = x => (x * 100).toFixed(1) + "%";
const cagr = (growth, months) => Math.pow(growth, 12 / months) - 1;

function stats(slice) {
  let v = 1, peak = 1, mdd = 0;
  slice.forEach(r => { v *= 1 + r; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1); });
  return { growth: v, months: slice.length, cagr: cagr(v, slice.length), mdd };
}

const rows = [];
const check = (claim, actual, ok, note) => rows.push({ claim, actual, ok, note: note || "" });

console.log(`D_RETS:${R.length} 筆,對應 ${label(0)} ~ ${label(R.length - 1)}`);
console.log(`資料範圍:最小 ${pct(Math.min(...R))} / 最大 ${pct(Math.max(...R))},無 NaN:${!R.some(Number.isNaN)}\n`);

/* ── 1. 全期 CAGR 與最大回撤 ── */
const all = stats(R);
check("1990–2026 全期 CAGR 15.2%", pct(all.cagr),
  Math.abs(all.cagr - 0.152) < 0.005);
check("1990–2026 全期 MaxDD -62.6%", pct(all.mdd),
  Math.abs(all.mdd + 0.626) < 0.005);

/* ── 2. 2015–2026 ── */
const s2015 = R.slice(idx(2015, 1));
const st2015 = stats(s2015);
check("2015–2026 CAGR ~20%", pct(st2015.cagr), Math.abs(st2015.cagr - 0.20) < 0.02,
  `${label(idx(2015, 1))} 起 ${st2015.months} 個月`);
check("2015–2026 MaxDD -36%", pct(st2015.mdd), Math.abs(st2015.mdd + 0.36) < 0.03);

/* ── 3. 最壞起點:逐月起算,找回本最慢的那一個 ── */
let worst = null;
for (let s = 0; s < R.length; s++) {
  let v = 1, peak = 1, mdd = 0, recovered = null;
  for (let k = s; k < R.length; k++) {
    v *= 1 + R[k]; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1);
    if (recovered === null && v >= 1) recovered = k - s + 1;
  }
  const months = R.length - s;
  /* 只看有足夠長度可評斷的起點 */
  if (months < 120) break;
  const rec = recovered === null ? Infinity : recovered;
  if (!worst || mdd < worst.mdd) worst = { s, mdd, rec, growth: v, months };
}
check("最壞起點最深回撤 -80%", pct(worst.mdd), Math.abs(worst.mdd + 0.80) < 0.03,
  `起點 ${label(worst.s)}`);

/* 宣稱「2000-03 最壞起點 · 13.8 年 1.09x」 */
const s2000 = idx(2000, 3);
let v = 1, peak = 1, mdd = 0;
const path2000 = [];
for (let k = s2000; k < R.length; k++) {
  v *= 1 + R[k]; peak = Math.max(peak, v); mdd = Math.min(mdd, v / peak - 1);
  path2000.push(v);
}
const at138 = path2000[Math.round(13.8 * 12) - 1];
check("2000-03 起算 13.8 年為 1.09x", at138 ? at138.toFixed(2) + "x" : "(資料不足)",
  at138 != null && Math.abs(at138 - 1.09) < 0.06);
check("2000-03 起算最深回撤 -80%", pct(mdd), Math.abs(mdd + 0.80) < 0.03);

/* ── 4. 4 年虧損機率(區塊拔靴法,與 App 內 MC 同法) ── */
function lossProb(paths, seed) {
  let s = seed >>> 0;
  const rand = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const H = 48, B = 12;
  let loss = 0;
  for (let p = 0; p < paths; p++) {
    let val = 1, n = 0;
    while (n < H) {
      const st = Math.floor(rand() * (R.length - B + 1));
      for (let k = 0; k < B && n < H; k++, n++) val *= 1 + R[st + k];
    }
    if (val < 1) loss++;
  }
  return loss / paths;
}
const probs = [1, 2, 3, 4, 5].map(i => lossProb(20000, 1000 * i));
const lo = Math.min(...probs), hi = Math.max(...probs);
check("4 年虧損機率 ~13%", `${pct(lo)} ~ ${pct(hi)}(5×20000 路徑)`,
  lo <= 0.13 && 0.13 <= hi, "偏離即代表當初的方法與現行不同");

/* ── 輸出 ── */
const W = 34;
console.log("宣稱".padEnd(W) + "實測".padEnd(26) + "結果");
console.log("─".repeat(W + 26 + 6));
let fails = 0;
rows.forEach(r => {
  if (!r.ok) fails++;
  console.log(r.claim.padEnd(W) + String(r.actual).padEnd(26) + (r.ok ? "符合" : "不符") + (r.note ? "  " + r.note : ""));
});
console.log("─".repeat(W + 26 + 6));
console.log(fails === 0 ? "全部相符:壓測頁的數字有資料支持。"
  : `${fails} 項不符——壓測頁的數字無法由 D_RETS 重現,需要標註或修正。`);
process.exit(0);

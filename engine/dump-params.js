#!/usr/bin/env node
/**
 * 由 engine.js 產生 engine.json。
 *
 * engine.js 的 PARAMS 是唯一真相;engine.json 只是給非 JavaScript
 * 消費端(回測 Python)讀的衍生產物,不可手動編輯。
 *
 *   node engine/dump-params.js           產生
 *   node engine/dump-params.js --check   只檢查是否同步(CI 用,不寫檔)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { PARAMS } = require("./engine.js");

const out = path.join(__dirname, "engine.json");
const payload = {
  _comment: "由 engine/dump-params.js 從 engine.js 產生,請勿手動編輯。修改參數請改 engine.js 的 PARAMS。",
  _generatedFrom: "engine/engine.js",
  params: PARAMS
};
const text = JSON.stringify(payload, null, 2) + "\n";

if (process.argv.includes("--check")) {
  /* 參數漂移是最難察覺的一種:有人改了 engine.js 的 PARAMS 卻忘了重新產生
     engine.json,回測那端就會拿到舊參數,而且不會有任何錯誤訊息。 */
  let current = null;
  try { current = fs.readFileSync(out, "utf8"); }
  catch (e) {
    console.error("engine.json 不存在。執行 node engine/dump-params.js 產生。");
    process.exit(1);
  }
  if (current.replace(/\r\n/g, "\n") !== text) {
    console.error("engine.json 與 engine.js 的 PARAMS 不同步。");
    console.error("執行 node engine/dump-params.js 重新產生後再提交。");
    process.exit(1);
  }
  console.log("engine.json 與 engine.js 同步");
  process.exit(0);
}

fs.writeFileSync(out, text);
console.log("已產生 " + path.relative(process.cwd(), out));

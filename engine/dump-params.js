#!/usr/bin/env node
/**
 * 由 engine.js 產生 engine.json。
 *
 * engine.js 的 PARAMS 是唯一真相;engine.json 只是給非 JavaScript
 * 消費端(回測 Python)讀的衍生產物,不可手動編輯。
 *
 *   node engine/dump-params.js
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
fs.writeFileSync(out, JSON.stringify(payload, null, 2) + "\n");
console.log("已產生 " + path.relative(process.cwd(), out));

#!/usr/bin/env node
/**
 * 測試入口。
 *
 *   node test/run.js              離線測試(黃金案例、不變量、平價)
 *   node test/run.js --contract   額外跑資料契約測試(需要網路,會打 Worker)
 *   node test/run.js --only 平價   只跑名稱含關鍵字的 suite
 */
"use strict";
const { run } = require("./harness.js");

const argv = process.argv.slice(2);
const withContract = argv.includes("--contract") || argv.includes("--all");
const onlyIx = argv.indexOf("--only");
const filter = onlyIx >= 0 ? argv[onlyIx + 1] : null;

require("./golden.test.js");
require("./invariant.test.js");
require("./parity.test.js");
if (withContract) require("./contract.test.js");

console.log("\x1b[1m三層攻守引擎 · 測試套件\x1b[0m");
if (!withContract) console.log("\x1b[90m(資料契約測試已略過,加 --contract 啟用)\x1b[0m");

run(filter).then(ok => process.exit(ok ? 0 : 1));

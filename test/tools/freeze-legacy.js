/**
 * 重新產生平價測試的凍結參照。
 *
 * 把指定 commit 的 index.html <script> 區塊抽出成獨立檔案。
 * 用程式抽取而非手抄,確保參照就是當時實際出貨的程式碼。
 *
 * 用法:node test/tools/freeze-legacy.js [commit]
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const COMMIT = process.argv[2] || "4916c0a";
const OUT = path.join(__dirname, "..", "fixtures", `legacy-engine-${COMMIT}.js`);

const html = execSync(`git show ${COMMIT}:index.html`, { encoding: "utf8", maxBuffer: 1e8 });
const m = html.match(/<script>\n([\s\S]*?)<\/script>/);
if (!m) throw new Error("找不到 script 區塊");

const header =
  `/* 自動抽取,請勿手動編輯。\n` +
  `   來源:commit ${COMMIT} 的 index.html <script> 區塊(重構為共用引擎之前)。\n` +
  `   用途:平價測試的凍結參照——證明重構後的決策與此完全相同。\n` +
  `   重新產生:node test/tools/freeze-legacy.js */\n`;

fs.writeFileSync(OUT, header + m[1]);
console.log(`已凍結 ${COMMIT} → ${path.relative(process.cwd(), OUT)}(${m[1].split("\n").length} 行)`);

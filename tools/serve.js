/* 本機靜態伺服器。
   index.html 必須跟 engine/ 和 data/ 一起載入,用 file:// 直接開會被 CORS
   擋掉 fetch,整頁報錯——所以開發與驗證一定要起一個 server。
   零相依,只服務指定資料夾底下的檔案,只聽 127.0.0.1。

   node tools/serve.js . 8777   →  http://localhost:8777 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(process.argv[2] || ".");
/* PORT 優先:8777 被佔用時 Claude Code 會改派一個,靠參數寫死就連不上 */
const PORT = +(process.env.PORT || process.argv[3] || 8777);

const TYPE = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

http.createServer(function (req, res) {
  const url = decodeURIComponent(String(req.url).split("?")[0]);
  const p = path.join(ROOT, url === "/" ? "index.html" : url);
  /* 不准爬出 ROOT */
  if (path.relative(ROOT, p).startsWith("..")) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }
  fs.readFile(p, function (e, buf) {
    if (e) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 " + url);
      return;
    }
    res.writeHead(200, {
      "content-type": TYPE[path.extname(p).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(buf);
  });
}).listen(PORT, "127.0.0.1", function () {
  console.log("serving " + ROOT + " on http://localhost:" + PORT);
});

/** 極簡測試框架:零相依,只用 Node 內建模組 */
"use strict";
const assert = require("assert");

const suites = [];
let current = null;

function describe(name, fn) {
  current = { name, tests: [] };
  suites.push(current);
  fn();
  current = null;
}

function it(name, fn) {
  if (!current) throw new Error("it() 必須寫在 describe() 內");
  current.tests.push({ name, fn });
}

/** 只跑這個 suite(除錯用) */
describe.only = function (name, fn) { describe(name, fn); current = null; suites[suites.length - 1].only = true; };
it.skip = function (name) { if (current) current.tests.push({ name, skip: true }); };

const C = {
  g: s => `\x1b[32m${s}\x1b[0m`, r: s => `\x1b[31m${s}\x1b[0m`,
  y: s => `\x1b[33m${s}\x1b[0m`, d: s => `\x1b[90m${s}\x1b[0m`,
  b: s => `\x1b[1m${s}\x1b[0m`
};

async function run(filter) {
  let pass = 0, fail = 0, skip = 0;
  const failures = [];
  const only = suites.filter(s => s.only);
  const list = (only.length ? only : suites).filter(s => !filter || s.name.includes(filter));

  for (const s of list) {
    console.log("\n" + C.b(s.name));
    for (const t of s.tests) {
      if (t.skip) { skip++; console.log("  " + C.y("○") + " " + C.d(t.name)); continue; }
      try {
        await t.fn(assert);
        pass++;
        console.log("  " + C.g("✓") + " " + t.name);
      } catch (e) {
        fail++;
        failures.push({ suite: s.name, test: t.name, err: e });
        console.log("  " + C.r("✗") + " " + t.name);
        console.log("    " + C.r(String(e.message).split("\n").join("\n    ")));
      }
    }
  }

  console.log("\n" + "─".repeat(60));
  const parts = [C.g(pass + " 通過")];
  if (fail) parts.push(C.r(fail + " 失敗"));
  if (skip) parts.push(C.y(skip + " 略過"));
  console.log(parts.join("  ·  "));

  if (fail) {
    console.log("\n" + C.r(C.b("失敗明細")));
    failures.forEach(f => {
      console.log("\n  " + f.suite + " › " + f.test);
      console.log("  " + String(f.err.stack || f.err).split("\n").slice(0, 6).join("\n  "));
    });
  }
  return fail === 0;
}

module.exports = { describe, it, run, assert };

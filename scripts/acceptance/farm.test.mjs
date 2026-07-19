import assert from "node:assert/strict";
import { test } from "node:test";

import { applyGateReport, applyRouting, classifyRetryResults, collectSpecs, escapeRegex, flakySlug, mergeVerdicts, VRT_TAG } from "./farm.mjs";

test("escapeRegex は正規表現メタ文字をすべてリテラル化する", () => {
  const title = "初期表示の視覚回帰 (light) [a-z] $1 c++ ?";
  const re = new RegExp(escapeRegex(title));
  assert.equal(re.test(title), true);
  assert.equal(re.test("初期表示の視覚回帰 Xlight)"), false);
});

test("collectSpecs はネストした suites から title/ok/tags を再帰収集し @ を正規化する", () => {
  const report = {
    specs: [{ title: "top", ok: true, tags: [] }],
    suites: [
      {
        specs: [{ title: "nested-fail", ok: false, tags: ["@vrt"] }],
        suites: [{ specs: [{ title: "deep", ok: true, tags: ["vrt"] }], suites: [] }],
      },
    ],
  };
  const specs = collectSpecs(report);
  assert.deepEqual(specs.map((s) => s.title), ["top", "nested-fail", "deep"]);
  assert.deepEqual(specs.find((s) => s.title === "nested-fail")?.tags, [VRT_TAG]);
  assert.deepEqual(specs.find((s) => s.title === "deep")?.tags, [VRT_TAG]);
});

test("classifyRetryResults は再実行で通ったものだけ flaky にする", () => {
  const failed = [
    { title: "a", ok: false, tags: [] },
    { title: "b", ok: false, tags: [] },
    { title: "c", ok: false, tags: [] },
  ];
  const retry = [
    { title: "a", ok: true, tags: [] },
    { title: "b", ok: false, tags: [] },
    // c は再実行結果に現れない（クラッシュ等）→ 保守的に persistent
  ];
  const { flaky, persistent } = classifyRetryResults(failed, retry);
  assert.deepEqual(flaky.map((s) => s.title), ["a"]);
  assert.deepEqual(persistent.map((s) => s.title), ["b", "c"]);
});

test("flakySlug は非英数字を折り畳み 40 文字以内の小文字スラグにする", () => {
  assert.equal(flakySlug("初期表示の視覚回帰 (light)"), "light");
  assert.equal(flakySlug("!!!"), "flaky");
  const long = flakySlug(`Very Long Title ${"x".repeat(100)}`);
  assert.ok(long.length <= 40);
  assert.match(long, /^[a-z0-9-]+$/);
});

test("mergeVerdicts: fail > not_run > pass の優先で合成する", () => {
  assert.equal(mergeVerdicts("pass", "pass"), "pass");
  assert.equal(mergeVerdicts("pass", "fail"), "fail");
  assert.equal(mergeVerdicts("not_run", "fail"), "fail");
  assert.equal(mergeVerdicts("pass", "not_run"), "not_run");
  assert.equal(mergeVerdicts("not_run", "pass"), "not_run");
});

test("applyGateReport: applicable=false は無変更・fail は failedTests と notes を統合する", () => {
  const base = { verdict: "pass", failedTests: ["t1"], notes: "base" };
  assert.deepEqual(applyGateReport(base, { applicable: false, verdict: "fail", failedChecks: ["x"], notes: "n" }), base);
  const merged = applyGateReport(base, {
    applicable: true,
    verdict: "fail",
    failedChecks: ["canary:tick1:exit"],
    notes: "canary fail: canary:tick1:exit",
  });
  assert.equal(merged.verdict, "fail");
  assert.deepEqual(merged.failedTests, ["t1", "canary:tick1:exit"]);
  assert.equal(merged.notes, "base / canary fail: canary:tick1:exit");
  // pass ゲートは verdict を変えず notes だけ足す
  const passed = applyGateReport(base, { applicable: true, verdict: "pass", failedChecks: [], notes: "canary pass (3 ticks)" });
  assert.equal(passed.verdict, "pass");
  assert.equal(passed.notes, "base / canary pass (3 ticks)");
});

test("applyRouting: auto / machine は route 差し替えのみ・human は pending 化して farm verdict を notes に残す", () => {
  const base = { route: "machine", verdict: "pass", decidedAt: "2026-07-19T00:00:00.000Z", failedTests: [], notes: "base" };
  const machine = applyRouting(base, { route: "machine", score: 0.31, reasons: ["score=0.310 -> machine"] });
  assert.equal(machine.route, "machine");
  assert.equal(machine.verdict, "pass");
  assert.match(machine.notes, /route=machine score=0\.310/);
  const human = applyRouting(base, { route: "human", score: 0.75, reasons: ["score=0.750 -> human"] });
  assert.equal(human.route, "human");
  assert.equal(human.verdict, "pending");
  assert.equal(human.decidedAt, null);
  assert.match(human.notes, /farm verdict=pass/);
  // score null（縮退 human）でも notes が壊れない
  const degraded = applyRouting(base, { route: "human", score: null, reasons: ["risk inputs unavailable"] });
  assert.equal(degraded.verdict, "pending");
  assert.match(degraded.notes, /route=human \(risk inputs unavailable\)/);
});

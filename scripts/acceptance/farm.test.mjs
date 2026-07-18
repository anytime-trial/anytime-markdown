import assert from "node:assert/strict";
import { test } from "node:test";

import { classifyRetryResults, collectSpecs, escapeRegex, flakySlug, VRT_TAG } from "./farm.mjs";

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

// What: Daily Build Check の build ジョブは、e2e 込みの所要時間に対して timeout-minutes が足りている。
//
// 2026-10-03〜10-06 の master 実行は、e2e 前の工程（VSIX 5 本のビルドなど）約 12 分 + e2e 約 19 分で
// 当時の 30 分に当たり、e2e 途中で cancel された。cancel は `notify-on-failure` の `if: failure()` に
// 掛からず Issue にも残らないため、上限は実測の合計に 1.4 倍以上の余裕を持たせて固定する。
//
// Why not js-yaml: root の直接依存に無く（eslint 系の overrides で hoist されているだけ）、
// scripts/*.test.mjs の他のテストも使っていない。必要な値は 2 つだけなので、ジョブ節を行単位で切り出す。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(here, "..", ".github", "workflows", "daily-build.yml");

/** `jobs:` 直下の `<name>:`（インデント 2）から次のジョブ直前までの行を返す */
function extractJobLines(yamlText, jobName) {
  const lines = yamlText.split("\n");
  const start = lines.indexOf(`  ${jobName}:`);
  assert.notEqual(start, -1, `jobs.${jobName} が見つからない`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^ {2}\S/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

const build = extractJobLines(fs.readFileSync(workflowPath, "utf8"), "build");
const timeoutLine = build.find((l) => /^ {4}timeout-minutes:/.test(l));
const timeoutMinutes = Number(timeoutLine?.split(":")[1]);

/**
 * 実測（2026-10-03 run 37159523817）: e2e 開始まで 12 分、e2e 本体 19 分。
 * CI は retries: 2 / workers: 1 のため失敗テストが増えると e2e は伸びる。
 * upgrade: この下限を 2 回以上上げることになったら、e2e ステップ単位の timeout-minutes を設けて伸びを Issue に残す。
 */
const MEASURED_MINUTES = 12 + 19;

test("build ジョブに e2e ステップがある（timeout の前提）", () => {
  assert.ok(build.some((l) => /^ {6}- name: Run e2e tests$/.test(l)), "Run e2e tests が build ジョブに無い");
});

test("build ジョブの timeout-minutes は実測合計の 1.4 倍以上", () => {
  assert.ok(Number.isFinite(timeoutMinutes), "build ジョブに timeout-minutes が無い");
  assert.ok(
    timeoutMinutes >= Math.ceil(MEASURED_MINUTES * 1.4),
    `timeout-minutes=${timeoutMinutes} は実測 ${MEASURED_MINUTES} 分に対して余裕が無い`,
  );
});

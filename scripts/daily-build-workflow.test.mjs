// What: Daily Build Check の build ジョブは、e2e 込みの所要時間に対して timeout-minutes が足りている。
//
// 2026-10-03〜10-06 の master 実行は、e2e 前の工程（VSIX 5 本のビルドなど）約 12 分 + e2e 約 19 分で
// 当時の 30 分に当たり、e2e 途中で cancel された。cancel は `notify-on-failure` の `if: failure()` に
// 掛からず Issue にも残らないため、上限は実測の合計に 1.4 倍以上の余裕を持たせて固定する。
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import yaml from "js-yaml";

const here = path.dirname(fileURLToPath(import.meta.url));
const workflowPath = path.join(here, "..", ".github", "workflows", "daily-build.yml");
const workflow = yaml.load(fs.readFileSync(workflowPath, "utf8"));
const build = workflow.jobs.build;

/** 実測（2026-10-03 run 37159523817）: e2e 開始まで 12 分、e2e 本体 19 分 */
const MEASURED_MINUTES = 12 + 19;

test("build ジョブに e2e ステップがある（timeout の前提）", () => {
  assert.ok(build.steps.some((s) => s.name === "Run e2e tests"), "Run e2e tests が build ジョブに無い");
});

test("build ジョブの timeout-minutes は実測合計の 1.4 倍以上", () => {
  assert.ok(
    build["timeout-minutes"] >= Math.ceil(MEASURED_MINUTES * 1.4),
    `timeout-minutes=${build["timeout-minutes"]} は実測 ${MEASURED_MINUTES} 分に対して余裕が無い`,
  );
});

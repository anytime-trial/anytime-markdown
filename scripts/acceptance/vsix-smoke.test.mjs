import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { classifyPackageFailure, runVsixSmoke, selectVsixTargets } from "./vsix-smoke.mjs";

const TMP_DIRS = [];
function mkTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of TMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
});

const CONFIG = {
  targets: [
    {
      pkg: "vscode-agent-extension",
      extensionId: "anytime-trial.anytime-agent",
      command: "anytime-agent.mapping.refresh",
      paths: ["packages/vscode-agent-extension/", "packages/vscode-common/"],
    },
  ],
  stageTimeoutMs: 5000,
};

test("selectVsixTargets: paths の prefix 一致で対象を選び、非該当は空", () => {
  assert.equal(selectVsixTargets(["packages/vscode-agent-extension/src/extension.ts"], CONFIG).length, 1);
  assert.equal(selectVsixTargets(["packages/vscode-common/src/util.ts"], CONFIG).length, 1);
  assert.equal(selectVsixTargets(["packages/web-app/src/page.tsx"], CONFIG).length, 0);
  assert.equal(selectVsixTargets([], CONFIG).length, 0);
});

test("classifyPackageFailure: ツール解決・ネットワーク起因は not_run・ビルド失敗は fail", () => {
  assert.equal(classifyPackageFailure({ error: new Error("spawn npx ENOENT"), stderr: "" }), "not_run");
  assert.equal(classifyPackageFailure({ error: null, stderr: "npm ERR! E404 not found vsce" }), "not_run");
  assert.equal(classifyPackageFailure({ error: null, stderr: "getaddrinfo ENOTFOUND registry.npmjs.org" }), "not_run");
  assert.equal(classifyPackageFailure({ error: null, stderr: "webpack compiled with 3 errors" }), "fail");
});

test("runVsixSmoke: 対象外の変更は applicable=false でパッケージングしない", async () => {
  let packaged = 0;
  const r = await runVsixSmoke({
    changedFiles: ["packages/web-app/src/page.tsx"],
    config: CONFIG,
    packageImpl: () => {
      packaged += 1;
      return { ok: false, verdict: "fail", detail: "should not run" };
    },
  });
  assert.equal(r.applicable, false);
  assert.equal(packaged, 0);
});

test("runVsixSmoke: package fail はチェック名 vsix:<pkg>:package で fail", async () => {
  const reportPath = path.join(mkTmpDir("vsix-report-"), "r.json");
  const r = await runVsixSmoke({
    changedFiles: ["packages/vscode-agent-extension/src/extension.ts"],
    config: CONFIG,
    reportPath,
    packageImpl: () => ({ ok: false, verdict: "fail", detail: "webpack error" }),
    smokeImpl: async () => {
      throw new Error("must not reach smoke after package failure");
    },
  });
  assert.equal(r.applicable, true);
  assert.equal(r.verdict, "fail");
  assert.deepEqual(r.failedChecks, ["vsix:vscode-agent-extension:package"]);
});

test("runVsixSmoke: package not_run（環境）は verdict not_run で fail-open しない", async () => {
  const r = await runVsixSmoke({
    changedFiles: ["packages/vscode-agent-extension/src/extension.ts"],
    config: CONFIG,
    reportPath: path.join(mkTmpDir("vsix-report-"), "r.json"),
    packageImpl: () => ({ ok: false, verdict: "not_run", detail: "vsce unavailable" }),
  });
  assert.equal(r.verdict, "not_run");
  assert.deepEqual(r.failedChecks, []);
});

test("runVsixSmoke: smoke fail / not_run / pass の集約と report 出力", async () => {
  const reportPath = path.join(mkTmpDir("vsix-report-"), "r.json");
  const mk = (verdict) =>
    runVsixSmoke({
      changedFiles: ["packages/vscode-agent-extension/src/extension.ts"],
      config: CONFIG,
      reportPath,
      packageImpl: () => ({ ok: true, vsixPath: "/tmp/x.vsix" }),
      smokeImpl: async () => ({ verdict, detail: `smoke ${verdict}` }),
    });
  const failed = await mk("fail");
  assert.equal(failed.verdict, "fail");
  assert.deepEqual(failed.failedChecks, ["vsix:vscode-agent-extension:smoke"]);
  const notRun = await mk("not_run");
  assert.equal(notRun.verdict, "not_run");
  const pass = await mk("pass");
  assert.equal(pass.verdict, "pass");
  assert.match(pass.notes, /smoke pass/);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.verdict, "pass");
  assert.equal(report.results[0].stage, "smoke");
});

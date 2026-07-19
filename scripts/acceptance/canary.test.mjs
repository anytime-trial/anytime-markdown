import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  buildSandbox,
  checkStatusTransitions,
  cleanupSandbox,
  evaluateTick,
  findErrorLines,
  matchLoopFiles,
  parseTicketFrontmatter,
  readTicketStatuses,
  runCanary,
  runTick,
  scanLeftoverProcesses,
} from "./canary.mjs";

const TMP_DIRS = [];
function mkTmpDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  TMP_DIRS.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const dir of TMP_DIRS) fs.rmSync(dir, { recursive: true, force: true });
});

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** loop パスに触れるコミットを 1 つ持つ最小リポジトリを作る（runCanary の listChangedFiles が読む対象）。 */
function makeRepoWithLoopChange({ loop = true } = {}) {
  const repo = mkTmpDir("canary-repo-");
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "t@local"], repo);
  git(["config", "user.name", "t"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "base\n");
  git(["add", "."], repo);
  git(["commit", "-m", "base"], repo);
  const target = loop ? ".claude/skills/anytime-loop-start/SKILL.md" : "docs/other.md";
  const abs = path.join(repo, target);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "changed\n");
  git(["add", "."], repo);
  git(["commit", "-m", "change"], repo);
  return repo;
}

function writeShim(script) {
  const dir = mkTmpDir("canary-shim-");
  const bin = path.join(dir, "claude-shim.sh");
  fs.writeFileSync(
    bin,
    `#!/bin/bash
if [ "$1" = "--version" ]; then echo "shim 1.0"; exit 0; fi
${script}
`,
  );
  fs.chmodSync(bin, 0o755);
  return bin;
}

const TICK_OK = `cd "$ANYTIME_TICKETS_DIR"
sed -i 's/^status: up_next/status: in_progress/' .tickets/T-1.md
git add .tickets/T-1.md
git -c user.email=s@l -c user.name=s commit -q -m "ticket: T-1 in_progress" || true
git push -q origin main || true
echo "[INFO] tick ok"
exit 0`;

const SMALL_CONFIG = {
  loopPaths: [".claude/skills/anytime-loop-start/", ".claude/skills/anytime-loop-stop/"],
  maxTicks: 2,
  model: "haiku",
  tickTimeoutMs: 15000,
  vsix: { targets: [], stageTimeoutMs: 1000 },
};

// --- 純ロジック ---

test("matchLoopFiles: 末尾スラッシュは prefix・それ以外は完全一致", () => {
  const patterns = [".claude/skills/anytime-loop-start/", "scripts/one-file.mjs"];
  assert.deepEqual(
    matchLoopFiles(
      [".claude/skills/anytime-loop-start/SKILL.md", "scripts/one-file.mjs", "scripts/one-file.mjs.bak", "src/app.ts"],
      patterns,
    ),
    [".claude/skills/anytime-loop-start/SKILL.md", "scripts/one-file.mjs"],
  );
});

test("parseTicketFrontmatter: 正常系とフロントマター欠落", () => {
  const fm = parseTicketFrontmatter(`---\nid: T-1\nstatus: up_next\ntitle: "x"\n---\n\nbody`);
  assert.equal(fm.id, "T-1");
  assert.equal(fm.status, "up_next");
  assert.equal(parseTicketFrontmatter("no frontmatter"), null);
});

test("checkStatusTransitions: 前進と同値継続は ok・逆行と未知 status は fail", () => {
  assert.equal(checkStatusTransitions(["up_next", "in_progress", "in_progress"]).ok, true);
  assert.equal(checkStatusTransitions(["in_progress", "backlog"]).ok, false);
  assert.equal(checkStatusTransitions(["up_next", "deleted"]).ok, false);
  assert.equal(checkStatusTransitions([]).ok, true);
});

test("findErrorLines: [ERROR] とログ行頭 Error: を拾い、文中の error は拾わない", () => {
  const out = "[2026-07-19T00:00:00.000Z] [ERROR] boom\nError: crashed\nthis line mentions error politely\n[INFO] ok";
  assert.equal(findErrorLines(out).length, 2);
});

test("evaluateTick: exit 非 0 / timeout / ERROR ログを別チェック名で返す", () => {
  assert.deepEqual(evaluateTick({ index: 1, exitCode: 0, timedOut: false, spawnError: null, output: "[INFO] ok" }), []);
  assert.deepEqual(evaluateTick({ index: 2, exitCode: 1, timedOut: false, spawnError: null, output: "" }), ["canary:tick2:exit"]);
  assert.deepEqual(evaluateTick({ index: 3, exitCode: null, timedOut: true, spawnError: null, output: "" }), ["canary:tick3:timeout"]);
  assert.deepEqual(evaluateTick({ index: 4, exitCode: 0, timedOut: false, spawnError: null, output: "[ERROR] x" }), ["canary:tick4:error-log"]);
});

// --- sandbox とチケット読み取り ---

test("buildSandbox: fixture チケットと bare remote が作られ、push が外部へ出ない", () => {
  const sandbox = buildSandbox({ commit: "HEAD", skipWorkspace: true });
  try {
    const statuses = readTicketStatuses(sandbox.tickets);
    assert.deepEqual(statuses, { "T-1.md": "up_next" });
    const remotes = git(["remote", "-v"], sandbox.tickets);
    assert.match(remotes, /origin\s+\/.*tickets-remote\.git/);
  } finally {
    cleanupSandbox(sandbox);
  }
});

// --- 一気通貫（shim・小型リポジトリ・実 worktree） ---

test("runCanary: ループ系変更なしなら applicable=false で tick を実行しない", async () => {
  const repo = makeRepoWithLoopChange({ loop: false });
  const r = await runCanary({ commit: "HEAD", root: repo, config: SMALL_CONFIG, claudeBin: "/nonexistent/claude" });
  assert.equal(r.applicable, false);
  assert.equal(r.verdict, "pass");
});

test("runCanary: claude CLI 不在は not_run（fail-open にしない）", async () => {
  const repo = makeRepoWithLoopChange();
  const r = await runCanary({ commit: "HEAD", root: repo, config: SMALL_CONFIG, claudeBin: "/nonexistent/claude" });
  assert.equal(r.applicable, true);
  assert.equal(r.verdict, "not_run");
  assert.match(r.notes, /not_run/);
});

test("runCanary: 正常 tick（状態遷移 up_next→in_progress）で pass し、report を書く", async () => {
  const repo = makeRepoWithLoopChange();
  const reportPath = path.join(mkTmpDir("canary-report-"), "canary-report.json");
  const r = await runCanary({ commit: "HEAD", root: repo, config: SMALL_CONFIG, claudeBin: writeShim(TICK_OK), reportPath });
  assert.equal(r.applicable, true);
  assert.equal(r.verdict, "pass");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.verdict, "pass");
  assert.equal(report.ticks.length, 2);
  assert.equal(report.ticks[0].statuses["T-1.md"], "in_progress");
});

test("runCanary: ERROR ログ + exit 非 0 の tick は fail", async () => {
  const repo = makeRepoWithLoopChange();
  const shim = writeShim(`echo "[ERROR] boom"\nexit 1`);
  const reportPath = path.join(mkTmpDir("canary-report-"), "canary-report.json");
  const r = await runCanary({ commit: "HEAD", root: repo, config: SMALL_CONFIG, claudeBin: shim, reportPath });
  assert.equal(r.verdict, "fail");
  assert.ok(r.failedChecks.includes("canary:tick1:exit"));
  assert.ok(r.failedChecks.includes("canary:tick1:error-log"));
});

test("runCanary: status の逆行（in_progress→backlog）を fail として検出する", async () => {
  const repo = makeRepoWithLoopChange();
  // tick1 で in_progress、tick2 で backlog へ逆行させる
  const shim = writeShim(`cd "$ANYTIME_TICKETS_DIR"
if grep -q '^status: up_next' .tickets/T-1.md; then
  sed -i 's/^status: up_next/status: in_progress/' .tickets/T-1.md
else
  sed -i 's/^status: in_progress/status: backlog/' .tickets/T-1.md
fi
exit 0`);
  const reportPath = path.join(mkTmpDir("canary-report-"), "canary-report.json");
  const r = await runCanary({ commit: "HEAD", root: repo, config: SMALL_CONFIG, claudeBin: shim, reportPath });
  assert.equal(r.verdict, "fail");
  assert.ok(r.failedChecks.some((c) => c.startsWith("canary:transition:T-1.md")));
});

test("runCanary: setsid で切り離された残留プロセスを検出して掃討する", async () => {
  const repo = makeRepoWithLoopChange();
  const shim = writeShim(`setsid sleep 60 < /dev/null > /dev/null 2>&1 &\nexit 0`);
  const reportPath = path.join(mkTmpDir("canary-report-"), "canary-report.json");
  const config = { ...SMALL_CONFIG, maxTicks: 1 };
  const r = await runCanary({ commit: "HEAD", root: repo, config, claudeBin: shim, reportPath });
  assert.equal(r.verdict, "fail");
  assert.ok(r.failedChecks.some((c) => c.startsWith("canary:leftover-process:")));
  // 掃討済み: sandbox marker はもう /proc に居ない（sandbox dir は cleanup 済みのため marker で直接照合できないが、
  // report から sandbox を復元できないので「fail 検出 + kill 実行」の主効果は上の 2 assert で観測する）
});

test("runCanary: tick timeout は kill して fail 扱い（ハングは回帰シグナル）", async () => {
  const repo = makeRepoWithLoopChange();
  const shim = writeShim(`sleep 30\nexit 0`);
  const reportPath = path.join(mkTmpDir("canary-report-"), "canary-report.json");
  const config = { ...SMALL_CONFIG, maxTicks: 1, tickTimeoutMs: 1000 };
  const r = await runCanary({ commit: "HEAD", root: repo, config, claudeBin: shim, reportPath });
  assert.equal(r.verdict, "fail");
  assert.ok(r.failedChecks.includes("canary:tick1:timeout"));
});

// --- runTick 単体（プロセスグループ kill の実測） ---

test("runTick: timeout 時にプロセスグループごと SIGKILL され子孫が残らない", async () => {
  const sandbox = buildSandbox({ commit: "HEAD", skipWorkspace: true });
  try {
    const shim = writeShim(`sleep 30 &\nwait`);
    const t = await runTick({ sandbox, config: { ...SMALL_CONFIG, tickTimeoutMs: 800 }, index: 1, claudeBin: shim });
    assert.equal(t.timedOut, true);
    // グループ kill 後、sandbox marker を持つ生存プロセスは居ない
    const alive = scanLeftoverProcesses(sandbox.dir).filter((p) => p.state !== "Z");
    assert.deepEqual(alive, []);
  } finally {
    cleanupSandbox(sandbox);
  }
});

// 自律受入基盤 S4: ローカルカナリア実行（要件書 spec/00.requirements/autonomous-acceptance-requirements.ja.md §7）。
//
// ループ系機能（anytime-loop-start / cron 自己確保 / 委譲実行系）に触れるマージを対象に、
// sandbox（一時 worktree + fixture チケットリポジトリ）で N tick のカナリアを実行し、
// 決定論検査（exit code・ERROR ログ・チケット状態遷移・残留プロセス）で判定する。
// 結果は farm.mjs が machine 記録（S5 台帳）へ統合する — acceptance_records の PK は
// (commit_sha, route) のため、canary が独立に POST すると farm の記録を UPSERT で相互破壊する。
//
// tick 実行体は headless claude CLI（低コストモデル固定・tick 数と時間の上限つき）。
// テストでは ACCEPTANCE_CLAUDE_BIN に shim を注入して決定論化する。

import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = path.join(ROOT, "scripts/acceptance/canary-config.json");
const REPORT_PATH = path.join(ROOT, "packages/web-app/test-results/canary-report.json");

// tick が触るのは fixture チケットのみで、canary は tick 環境へこの変数を必ず注入する。
// 残留プロセスの検出は /proc/<pid>/environ にこの marker が残っているかで行う。
const SANDBOX_ENV_KEY = "ACCEPTANCE_CANARY_SANDBOX";

export const TICKET_STATUS_RANK = { backlog: 0, up_next: 1, in_progress: 2, completed: 3 };

function log(level, msg) {
  console.log(`[${new Date().toISOString()}] [${level}] [canary] ${msg}`);
}

export function loadCanaryConfig(configPath = CONFIG_PATH) {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  return {
    loopPaths: raw.loopPaths ?? [],
    maxTicks: raw.maxTicks ?? 3,
    model: raw.model ?? "haiku",
    tickTimeoutMs: raw.tickTimeoutMs ?? 600000,
    vsix: raw.vsix ?? { targets: [], stageTimeoutMs: 300000 },
  };
}

/** 末尾 "/" は prefix、それ以外は完全一致。glob は使わない（決定論・依存なし）。 */
export function matchLoopFiles(files, patterns) {
  return files.filter((f) => patterns.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)));
}

/** マージコミットが develop に持ち込んだ変更 = 第一親との diff。-z で非 ASCII のクォート表記を回避する。 */
export function listChangedFiles(commitSha, cwd = ROOT) {
  const out = execFileSync("git", ["diff", "--name-only", "-z", `${commitSha}^`, commitSha], {
    cwd,
    encoding: "utf8",
  });
  return out.split("\0").filter(Boolean);
}

/** 依存なしの最小 YAML 抽出（スカラー行のみ）。fixture チケットは自前生成のためこれで足りる。 */
export function parseTicketFrontmatter(content) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!m) return null;
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  return data;
}

/**
 * status 列（tick 毎の観測値）の検査。未知 status・rank の逆行（in_progress→backlog 等）を fail とする。
 * 同 rank の継続（in_progress→in_progress = 委譲実行中）は正常。
 */
export function checkStatusTransitions(sequence) {
  for (const s of sequence) {
    if (!(s in TICKET_STATUS_RANK)) return { ok: false, reason: `unknown status: ${s}` };
  }
  for (let i = 1; i < sequence.length; i++) {
    if (TICKET_STATUS_RANK[sequence[i]] < TICKET_STATUS_RANK[sequence[i - 1]]) {
      return { ok: false, reason: `regressed: ${sequence[i - 1]} -> ${sequence[i]}` };
    }
  }
  return { ok: true, reason: "" };
}

const DEFAULT_FIXTURE_TICKET = `---
id: T-1
title: "カナリア用の自明タスク"
status: up_next
priority: medium
assignee: agent
workspace: anytime-markdown
creator: canary
created_at: 2026-07-19T00:00:00.000Z
updated_at: 2026-07-19T00:00:00.000Z
---

## 概要 (Description)

カナリア実行用の fixture チケット。NOTES.md に 1 行追記するのみ（外部作用なし）。
`;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * sandbox を構築する: 対象コミットの detached worktree + fixture チケットリポジトリ（ローカル bare remote つき）。
 * tick は push まで行う仕様のため、remote をローカル bare にして外部到達をゼロにする。
 * skipWorkspace はテスト用（worktree checkout は全ツリー展開で重く、tick shim は workspace を使わないため）。
 */
export function buildSandbox({ commit, root = ROOT, fixtureTicket = DEFAULT_FIXTURE_TICKET, skipWorkspace = false }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "acceptance-canary-"));
  // ディレクトリ名は自ワークスペース識別子の fallback 解決に使われるため、fixture チケットの
  // workspace: anytime-markdown と一致させる（不一致だと loop tick が全件対象外で空回りする — Codex 指摘）
  const workspace = path.join(dir, "anytime-markdown");
  if (!skipWorkspace) {
    git(["worktree", "add", "--detach", workspace, commit], root);
  } else {
    fs.mkdirSync(workspace, { recursive: true });
  }
  const tickets = path.join(dir, "tickets");
  const remote = path.join(dir, "tickets-remote.git");
  fs.mkdirSync(path.join(tickets, ".tickets"), { recursive: true });
  fs.writeFileSync(path.join(tickets, ".tickets/T-1.md"), fixtureTicket);
  git(["init", "-b", "main"], tickets);
  git(["config", "user.email", "canary@local"], tickets);
  git(["config", "user.name", "canary"], tickets);
  git(["add", "."], tickets);
  git(["commit", "-m", "canary fixture"], tickets);
  git(["init", "--bare", "-b", "main", remote], dir);
  git(["remote", "add", "origin", remote], tickets);
  git(["push", "-u", "origin", "main"], tickets);
  // チケットディレクトリと workspace 識別子の解決を VS Code 設定（最優先経路）で決定論化する
  fs.mkdirSync(path.join(workspace, ".vscode"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".vscode/settings.json"),
    `${JSON.stringify({ "anytimeAgent.tickets.directory": tickets, "anytimeAgent.tickets.workspace": "anytime-markdown" }, null, 2)}\n`,
  );
  return { dir, workspace, tickets, remote, skipWorkspace };
}

export function cleanupSandbox(sandbox, root = ROOT) {
  let needPrune = false;
  if (!sandbox.skipWorkspace) {
    try {
      git(["worktree", "remove", "--force", sandbox.workspace], root);
    } catch (e) {
      log("WARN", `worktree remove failed (${sandbox.workspace}): ${e instanceof Error ? e.message : String(e)}`);
      needPrune = true;
    }
  }
  fs.rmSync(sandbox.dir, { recursive: true, force: true });
  if (needPrune) {
    // remove 失敗のままディレクトリだけ消すと実リポジトリの .git/worktrees/<id> にメタデータが残る。
    // ディレクトリ削除後に prune すれば「実体なし」として回収される
    try {
      git(["worktree", "prune", "--expire", "now"], root);
    } catch (e) {
      log(
        "WARN",
        `worktree prune failed — stale metadata may remain under .git/worktrees (root=${root}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

export function readTicketStatuses(ticketsDir) {
  const dir = path.join(ticketsDir, ".tickets");
  const statuses = {};
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".md"))) {
    const fm = parseTicketFrontmatter(fs.readFileSync(path.join(dir, name), "utf8"));
    statuses[name] = fm?.status ?? null;
  }
  return statuses;
}

/**
 * 1 tick を実行する。detached（新プロセスグループ）で起動し、timeout 時はグループごと SIGKILL する。
 * claude ヘッドレスは stdin を開いたままにすると無限沈黙するため stdin は閉じる。
 */
export function runTick({ sandbox, config, index, claudeBin, extraEnv = {} }) {
  const logPath = path.join(sandbox.dir, `tick-${index}.log`);
  return new Promise((resolve) => {
    const child = spawn(
      claudeBin,
      ["-p", "/anytime-loop-start", "--model", config.model, "--permission-mode", "acceptEdits", "--add-dir", sandbox.tickets],
      {
        cwd: sandbox.workspace,
        env: {
          ...process.env,
          ANYTIME_TICKETS_DIR: sandbox.tickets,
          [SANDBOX_ENV_KEY]: sandbox.dir,
          ...extraEnv,
        },
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const chunks = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => chunks.push(c));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch (e) {
        log("WARN", `tick ${index} timeout kill failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, config.tickTimeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ index, exitCode: null, timedOut, spawnError: e.message, output: "", logPath });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      fs.writeFileSync(logPath, output);
      resolve({ index, exitCode: code, timedOut, spawnError: null, output, logPath });
    });
  });
}

/** 行頭の [ERROR] / Error: を検査する（ヘッドレス出力の決定論検査。文中の語は拾わない）。 */
export function findErrorLines(output) {
  return output.split("\n").filter((l) => /^\s*(\[ERROR\]|Error:)/.test(l) || /\[ERROR\]/.test(l));
}

/**
 * sandbox marker を environ に持つ残留プロセスを列挙する。
 * kill -0 単独の生死判定は禁止（ゾンビにも成功する既知の罠）— /proc/<pid>/stat の state を併記する。
 * ゾンビは environ が空になるため本 scan には現れないが、setsid で切り離された孫は init が回収するため
 * 定常的に残るのは alive な取り残しのみ（それを検出する）。
 */
export function scanLeftoverProcesses(marker) {
  const leftovers = [];
  for (const name of fs.readdirSync("/proc")) {
    if (!/^\d+$/.test(name) || Number(name) === process.pid) continue;
    let environ = "";
    try {
      environ = fs.readFileSync(`/proc/${name}/environ`, "utf8");
    } catch {
      // 他ユーザーのプロセス（EACCES）・scan 中に消えたプロセス（ENOENT）は対象外として黙ってスキップする
      // （/proc 全走査では常態のため、ログすると毎回数百行のノイズになる）
      continue;
    }
    if (!environ.split("\0").includes(`${SANDBOX_ENV_KEY}=${marker}`)) continue;
    let state = "?";
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, "utf8");
      state = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[0];
    } catch (e) {
      log("WARN", `stat read failed for pid ${name}: ${e instanceof Error ? e.message : String(e)}`);
    }
    leftovers.push({ pid: Number(name), state });
  }
  return leftovers;
}

export function killLeftoverProcesses(leftovers) {
  for (const { pid } of leftovers) {
    try {
      process.kill(pid, "SIGKILL");
    } catch (e) {
      log("WARN", `leftover kill failed (pid=${pid}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/** tick 1 回分の決定論検査。失敗はチェック名（canary:tickN:<check>）で返し、台帳 failedTests へそのまま入る。 */
export function evaluateTick(tickResult) {
  const failed = [];
  const n = tickResult.index;
  if (tickResult.timedOut) failed.push(`canary:tick${n}:timeout`);
  if (tickResult.spawnError) failed.push(`canary:tick${n}:spawn`);
  else if (!tickResult.timedOut && tickResult.exitCode !== 0) failed.push(`canary:tick${n}:exit`);
  if (findErrorLines(tickResult.output ?? "").length > 0) failed.push(`canary:tick${n}:error-log`);
  return failed;
}

/**
 * カナリア本体。farm から呼ばれる（単体 CLI 実行も可）。
 * 返り値: { applicable, verdict: pass|fail|not_run, failedChecks, notes, loopFiles }
 */
export async function runCanary({ commit, root = ROOT, config, claudeBin, reportPath = REPORT_PATH }) {
  const cfg = config ?? loadCanaryConfig();
  const changed = listChangedFiles(commit, root);
  const loopFiles = matchLoopFiles(changed, cfg.loopPaths);
  if (loopFiles.length === 0) {
    return { applicable: false, verdict: "pass", failedChecks: [], notes: "", loopFiles: [] };
  }
  log("INFO", `loop-system change detected (${loopFiles.length} file(s)) — running ${cfg.maxTicks} tick canary`);

  const bin = claudeBin ?? process.env.ACCEPTANCE_CLAUDE_BIN ?? "claude";
  // timeout 必須: probe がハングすると farm 全体が無期限ブロックする（timeout は error 経由で not_run へ倒れる）
  const probe = spawnSync(bin, ["--version"], { encoding: "utf8", timeout: 10000, killSignal: "SIGKILL" });
  if (probe.error || probe.status !== 0) {
    // 環境要因（CLI 不在）は fail でも pass でもなく not_run（fail-open 禁止・人手経路へ倒す。要件 §9）
    return {
      applicable: true,
      verdict: "not_run",
      failedChecks: [],
      notes: `canary not_run (claude CLI unavailable: ${bin})`,
      loopFiles,
    };
  }

  const sandbox = buildSandbox({ commit, root });
  const failedChecks = [];
  const ticks = [];
  const statusHistory = {};
  const initialStatuses = readTicketStatuses(sandbox.tickets);
  try {
    for (let i = 1; i <= cfg.maxTicks; i++) {
      const t = await runTick({ sandbox, config: cfg, index: i, claudeBin: bin });
      failedChecks.push(...evaluateTick(t));
      let statuses = {};
      try {
        statuses = readTicketStatuses(sandbox.tickets);
      } catch (e) {
        log("WARN", `ticket read failed after tick ${i}: ${e instanceof Error ? e.message : String(e)}`);
        failedChecks.push(`canary:tick${i}:ticket-state`);
      }
      for (const [file, status] of Object.entries(statuses)) {
        (statusHistory[file] ??= []).push(status);
        if (status === null) failedChecks.push(`canary:tick${i}:ticket-state`);
      }
      ticks.push({ index: i, exitCode: t.exitCode, timedOut: t.timedOut, statuses });
    }
    for (const [file, seq] of Object.entries(statusHistory)) {
      const check = checkStatusTransitions(seq.filter((s) => s !== null));
      if (!check.ok) failedChecks.push(`canary:transition:${file}:${check.reason}`);
    }
    // 無進捗は fail: 全 tick が正常終了してもチケットが 1 件も前進しないなら、loop は静かに空回りしている
    // （workspace 識別子不一致等の設定欠陥を pass に見せない — fail-open 禁止。Codex 指摘）
    const progressed = Object.entries(statusHistory).some(([file, seq]) => {
      const initial = initialStatuses[file];
      const last = [...seq].reverse().find((s) => s !== null);
      return (
        initial != null && last != null && initial in TICKET_STATUS_RANK && last in TICKET_STATUS_RANK &&
        TICKET_STATUS_RANK[last] > TICKET_STATUS_RANK[initial]
      );
    });
    if (!progressed) failedChecks.push("canary:no-progress");
    const leftovers = scanLeftoverProcesses(sandbox.dir).filter((p) => p.state !== "Z");
    if (leftovers.length > 0) {
      failedChecks.push(`canary:leftover-process:${leftovers.map((p) => p.pid).join(",")}`);
      killLeftoverProcesses(leftovers);
    }
  } finally {
    cleanupSandbox(sandbox, root);
  }

  const uniqueChecks = [...new Set(failedChecks)];
  const verdict = uniqueChecks.length > 0 ? "fail" : "pass";
  const report = { commit, verdict, loopFiles, failedChecks: uniqueChecks, ticks };
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } catch (e) {
    log("WARN", `canary report write failed (${reportPath}): ${e instanceof Error ? e.message : String(e)}`);
  }
  const notes =
    verdict === "pass"
      ? `canary pass (${cfg.maxTicks} ticks, ${loopFiles.length} loop file(s))`
      : `canary fail: ${uniqueChecks.join(", ")}`;
  log(verdict === "pass" ? "INFO" : "ERROR", notes);
  return { applicable: true, verdict, failedChecks: uniqueChecks, notes, loopFiles };
}

// 単体実行: node scripts/acceptance/canary.mjs --commit <sha>
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const idx = process.argv.indexOf("--commit");
  const commit = idx >= 0 ? process.argv[idx + 1] : "HEAD";
  runCanary({ commit })
    .then((r) => {
      log("INFO", `canary done: applicable=${r.applicable} verdict=${r.verdict}`);
      process.exit(r.verdict === "pass" ? 0 : r.verdict === "fail" ? 1 : 2);
    })
    .catch((e) => {
      log("ERROR", `canary crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      process.exit(2);
    });
}

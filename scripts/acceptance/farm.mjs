#!/usr/bin/env node
/**
 * 受入ファーム ランナー（自律受入基盤 S1）。
 *
 * 流れ: viewer build → quarantine 除外で Playwright 実行 → 失敗テストのみ再実行して
 * flaky 判定（通れば隔離 + 再現チケット起票）→ 結果を受入台帳（S5）へ記録する。
 *
 * 運用ループは決定論（LLM 推論なし）。台帳記録は trail-server HTTP が第一経路で、
 * 不達時はローカル JSONL へ退避する（trail.db への直書きは稼働中デーモンの WAL と
 * 競合し得るため行わない）。
 *
 * Usage: node scripts/acceptance/farm.mjs [--commit <sha>] [--update-baseline] [--skip-build] [--server <url>]
 * Exit: 0=pass / 1=fail / 2=not_run（ファーム自体の実行失敗。受入判定は人手経路へ戻す）
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_APP_DIR = path.join(ROOT, "packages/web-app");
const QUARANTINE_PATH = path.join(ROOT, "scripts/acceptance/quarantine.json");
const REPORT_PATH = path.join(WEB_APP_DIR, "test-results/acceptance-report.json");
const PENDING_PATH = path.join(ROOT, "scripts/acceptance/pending-records.jsonl");
const TICKETS_DIR = process.env.ACCEPTANCE_TICKETS_DIR ?? "/Shared/anytime-ticket/.tickets";
const DEFAULT_SERVER = process.env.TRAIL_SERVER_URL ?? "http://127.0.0.1:19841";

function log(level, msg) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { commit: "", updateBaseline: false, skipBuild: false, server: DEFAULT_SERVER };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--commit") args.commit = argv[++i] ?? "";
    else if (a === "--update-baseline") args.updateBaseline = true;
    else if (a === "--skip-build") args.skipBuild = true;
    else if (a === "--server") args.server = argv[++i] ?? DEFAULT_SERVER;
  }
  if (args.commit === "") {
    args.commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  }
  return args;
}

function loadQuarantine() {
  try {
    const parsed = JSON.parse(fs.readFileSync(QUARANTINE_PATH, "utf8"));
    return Array.isArray(parsed.quarantined) ? parsed.quarantined : [];
  } catch (e) {
    log("WARN", `quarantine.json read failed (${QUARANTINE_PATH}): ${e instanceof Error ? e.message : String(e)}`);
    return [];
  }
}

function saveQuarantine(entries) {
  fs.writeFileSync(QUARANTINE_PATH, `${JSON.stringify({ quarantined: entries }, null, 2)}\n`);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Playwright JSON レポートから spec 一覧（title / ok）を再帰収集する。 */
function collectSpecs(suite, out) {
  for (const spec of suite.specs ?? []) {
    out.push({ title: spec.title, ok: spec.ok === true });
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, out);
  }
  return out;
}

function runPlaywright({ grepInvert, grep, updateBaseline }) {
  const cli = [
    "playwright", "test",
    "-c", "playwright.acceptance.config.ts",
    ...(updateBaseline ? ["--update-snapshots"] : []),
    ...(grepInvert ? ["--grep-invert", grepInvert] : []),
    ...(grep ? ["--grep", grep] : []),
  ];
  fs.rmSync(REPORT_PATH, { force: true });
  const res = spawnSync("npx", cli, { cwd: WEB_APP_DIR, stdio: ["ignore", "inherit", "inherit"] });
  let specs = null;
  try {
    const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
    specs = (report.suites ?? []).flatMap((s) => collectSpecs(s, []));
  } catch (e) {
    log("WARN", `acceptance report parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return { status: res.status, specs };
}

function fileFlakyTicket(title, commitSha) {
  if (!fs.existsSync(TICKETS_DIR)) {
    log("WARN", `tickets dir not found, skip ticket for flaky test: ${TICKETS_DIR}`);
    return;
  }
  const now = new Date().toISOString();
  // id はサーバー採番（GitHub API）と衝突しないようエポック秒ベースの一意値にする（S3 で恒久採番へ再訪）
  const id = `T-${Math.floor(Date.now() / 1000)}`;
  const slug = title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "flaky";
  const file = path.join(TICKETS_DIR, `${id}-flaky-${slug}.md`);
  const body = [
    "---",
    `id: ${id}`,
    `title: "flaky 受入テストの再現調査: ${title.replace(/"/g, "'")}"`,
    "status: backlog",
    "priority: medium",
    "assignee: user",
    "workspace: anytime-markdown",
    "creator: acceptance-farm",
    `created_at: "${now}"`,
    `updated_at: "${now}"`,
    "---",
    "",
    "## 概要 (Description)",
    "",
    `受入ファーム（scripts/acceptance/farm.mjs）で flaky（同一コミット ${commitSha} に対する再実行で合否が変わる）と判定し、`,
    "`scripts/acceptance/quarantine.json` へ隔離した。原因を特定して安定化し、隔離を解除する。",
    "",
    "## 作業タスクリスト (Subtasks)",
    "",
    "- [ ] 再現条件の特定（タイミング・描画・環境依存）",
    "- [ ] テストまたは対象実装の安定化",
    "- [ ] quarantine.json から隔離解除",
    "",
  ].join("\n");
  fs.writeFileSync(file, body);
  log("INFO", `flaky ticket filed: ${file}`);
}

async function recordToLedger(server, payload) {
  try {
    const res = await fetch(`${server}/api/trail/acceptance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    log("INFO", `acceptance record saved via ${server} (commit=${payload.commitSha}, verdict=${payload.verdict})`);
    return true;
  } catch (e) {
    log("WARN", `ledger unreachable (${server}): ${e instanceof Error ? e.message : String(e)} — spooling to ${PENDING_PATH}`);
    fs.appendFileSync(PENDING_PATH, `${JSON.stringify(payload)}\n`);
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv);
  log("INFO", `acceptance farm start (commit=${args.commit})`);

  if (!args.skipBuild) {
    log("INFO", "building markdown-viewer (dist/anytime-markdown-editor.iife.js)");
    const build = spawnSync("npm", ["run", "-w", "@anytime-markdown/markdown-viewer", "build"], {
      cwd: ROOT,
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (build.status !== 0) {
      log("ERROR", "viewer build failed — farm not_run");
      await recordToLedger(args.server, notRunPayload(args, "viewer build failed"));
      process.exit(2);
    }
  }

  const quarantined = loadQuarantine();
  if (quarantined.length > 0) {
    log("INFO", `quarantined tests excluded (silent skip 禁止のため件数を台帳へ記録): ${quarantined.length}`);
  }
  const grepInvert = quarantined.length > 0 ? quarantined.map((q) => escapeRegex(q.title)).join("|") : undefined;

  const first = runPlaywright({ grepInvert, updateBaseline: args.updateBaseline });
  if (first.specs === null) {
    log("ERROR", "playwright produced no report — farm not_run");
    await recordToLedger(args.server, notRunPayload(args, "playwright report missing"));
    process.exit(2);
  }

  const failedTitles = first.specs.filter((s) => !s.ok).map((s) => s.title);
  let persistent = [];
  const flaky = [];
  if (failedTitles.length > 0) {
    log("INFO", `retrying ${failedTitles.length} failed test(s) for flaky detection`);
    const retry = runPlaywright({ grepInvert, grep: failedTitles.map(escapeRegex).join("|") });
    const retryResult = new Map((retry.specs ?? []).map((s) => [s.title, s.ok]));
    for (const title of failedTitles) {
      if (retryResult.get(title) === true) {
        flaky.push(title);
      } else {
        persistent.push(title);
      }
    }
  }

  if (flaky.length > 0) {
    const now = new Date().toISOString();
    const entries = [...quarantined, ...flaky.map((title) => ({ title, addedAt: now, commit: args.commit }))];
    saveQuarantine(entries);
    for (const title of flaky) {
      fileFlakyTicket(title, args.commit);
    }
    log("WARN", `flaky quarantined: ${flaky.join(" / ")}`);
  }

  const verdict = persistent.length > 0 ? "fail" : "pass";
  const vrtDiff = persistent.some((t) => t.includes("視覚回帰"));
  const payload = {
    commitSha: args.commit,
    route: "machine",
    verdict,
    decidedBy: "farm",
    decidedAt: new Date().toISOString(),
    repoName: "anytime-markdown",
    farmRunRef: path.relative(ROOT, REPORT_PATH),
    failedTests: persistent,
    vrtDiff,
    quarantinedCount: quarantined.length + flaky.length,
    notes: flaky.length > 0 ? `flaky quarantined this run: ${flaky.join(", ")}` : "",
  };
  await recordToLedger(args.server, payload);
  log("INFO", `acceptance farm done: verdict=${verdict} persistentFailures=${persistent.length} flaky=${flaky.length}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

function notRunPayload(args, reason) {
  return {
    commitSha: args.commit,
    route: "machine",
    verdict: "not_run",
    decidedBy: "farm",
    decidedAt: new Date().toISOString(),
    repoName: "anytime-markdown",
    farmRunRef: "",
    failedTests: [],
    vrtDiff: false,
    quarantinedCount: 0,
    notes: reason,
  };
}

main().catch((e) => {
  log("ERROR", `farm crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
  process.exit(2);
});

#!/usr/bin/env node
/**
 * 受入ファーム ランナー（自律受入基盤 S1）。
 *
 * 流れ: pending 再送 drain → viewer build → quarantine 除外で Playwright 実行 →
 * 失敗テストのみ再実行して flaky 判定（通れば隔離 + 再現チケット起票）→
 * 結果を受入台帳（S5）へ記録する。
 *
 * 運用ループは決定論（LLM 推論なし）。台帳記録は trail-server HTTP が第一経路で、
 * 不達時はローカル JSONL へ退避し **exit 2（not_run 扱い）で終了する** — 台帳へ記録
 * できていない pass をマージ判定の成功にしない（trail.db への直書きは稼働中デーモンの
 * WAL と競合し得るため行わない）。退避分は次回起動時の drain で再送する。
 *
 * flaky 再現チケットの起票先は環境変数 ACCEPTANCE_TICKETS_DIR で明示指定する。
 * 未設定時は起票をスキップして WARN + 台帳 notes に記録する（本番チケットストアへの
 * 暗黙フォールバックを持たない — 保護領域書き込みの本番パスフォールバック禁止原則）。
 *
 * Usage: node scripts/acceptance/farm.mjs [--commit <sha>] [--update-baseline] [--skip-build] [--server <url>]
 * Exit: 0=pass / 1=fail / 2=not_run（ファーム実行失敗または台帳記録失敗。受入判定は人手経路へ戻す）
 */

import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WEB_APP_DIR = path.join(ROOT, "packages/web-app");
const QUARANTINE_PATH = path.join(ROOT, "scripts/acceptance/quarantine.json");
const REPORT_PATH = path.join(WEB_APP_DIR, "test-results/acceptance-report.json");
const PENDING_PATH = path.join(ROOT, "scripts/acceptance/pending-records.jsonl");
const TICKETS_DIR = process.env.ACCEPTANCE_TICKETS_DIR ?? "";
const DEFAULT_SERVER = process.env.TRAIL_SERVER_URL ?? "http://127.0.0.1:19841";

/** VRT テストを機械判定するタグ（spec 側は `{ tag: "@vrt" }`。レポートでは先頭 @ の有無が揺れるため正規化）。 */
export const VRT_TAG = "vrt";

function log(level, msg) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Playwright JSON レポートから spec 一覧（title / ok / tags）を再帰収集する。 */
export function collectSpecs(suite, out = []) {
  for (const spec of suite.specs ?? []) {
    out.push({
      title: spec.title,
      ok: spec.ok === true,
      tags: (spec.tags ?? []).map((t) => (t.startsWith("@") ? t.slice(1) : t)),
    });
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, out);
  }
  return out;
}

/**
 * 初回失敗 spec と再実行結果から flaky（再実行で通った）/ persistent（再実行でも失敗）を分類する。
 * 再実行結果に現れなかった spec は保守的に persistent 扱い（通った証拠がないものを flaky にしない）。
 */
export function classifyRetryResults(failedSpecs, retrySpecs) {
  const retryOk = new Map(retrySpecs.map((s) => [s.title, s.ok]));
  const flaky = [];
  const persistent = [];
  for (const spec of failedSpecs) {
    if (retryOk.get(spec.title) === true) {
      flaky.push(spec);
    } else {
      persistent.push(spec);
    }
  }
  return { flaky, persistent };
}

export function flakySlug(title) {
  return (
    title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40).toLowerCase() || "flaky"
  );
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
  if (TICKETS_DIR === "") {
    log("WARN", `ACCEPTANCE_TICKETS_DIR is not set — flaky ticket not filed (title: ${title}). 隔離と台帳 notes 記録のみ行う`);
    return false;
  }
  if (!fs.existsSync(TICKETS_DIR)) {
    log("WARN", `tickets dir not found, skip ticket for flaky test: ${TICKETS_DIR}`);
    return false;
  }
  const now = new Date().toISOString();
  // id はサーバー採番（GitHub API）と衝突しないようエポック秒ベースの一意値にする（S3 で恒久採番へ再訪）
  const id = `T-${Math.floor(Date.now() / 1000)}`;
  const file = path.join(TICKETS_DIR, `${id}-flaky-${flakySlug(title)}.md`);
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
  return true;
}

async function postRecord(server, payload) {
  const res = await fetch(`${server}/api/trail/acceptance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

/** 前回不達分の再送。成功した行だけ取り除く（at-least-once。台帳側は冪等 UPSERT で吸収）。 */
async function drainPending(server) {
  if (!fs.existsSync(PENDING_PATH)) return;
  const lines = fs.readFileSync(PENDING_PATH, "utf8").split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    fs.rmSync(PENDING_PATH, { force: true });
    return;
  }
  const remaining = [];
  for (const line of lines) {
    try {
      await postRecord(server, JSON.parse(line));
    } catch (e) {
      log("WARN", `pending drain failed for one record: ${e instanceof Error ? e.message : String(e)}`);
      remaining.push(line);
    }
  }
  if (remaining.length === 0) {
    fs.rmSync(PENDING_PATH, { force: true });
    log("INFO", `pending records drained: ${lines.length}`);
  } else {
    fs.writeFileSync(PENDING_PATH, `${remaining.join("\n")}\n`);
    log("WARN", `pending records remaining: ${remaining.length}/${lines.length}`);
  }
}

async function recordToLedger(server, payload) {
  try {
    await postRecord(server, payload);
    log("INFO", `acceptance record saved via ${server} (commit=${payload.commitSha}, verdict=${payload.verdict})`);
    return true;
  } catch (e) {
    log("WARN", `ledger unreachable (${server}): ${e instanceof Error ? e.message : String(e)} — spooling to ${PENDING_PATH}`);
    fs.appendFileSync(PENDING_PATH, `${JSON.stringify(payload)}\n`);
    return false;
  }
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

async function main() {
  const args = parseArgs(process.argv);
  log("INFO", `acceptance farm start (commit=${args.commit})`);

  await drainPending(args.server);

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

  const failedSpecs = first.specs.filter((s) => !s.ok);
  let flaky = [];
  let persistent = [];
  if (failedSpecs.length > 0) {
    log("INFO", `retrying ${failedSpecs.length} failed test(s) for flaky detection`);
    const retry = runPlaywright({ grepInvert, grep: failedSpecs.map((s) => escapeRegex(s.title)).join("|") });
    ({ flaky, persistent } = classifyRetryResults(failedSpecs, retry.specs ?? []));
  }

  let ticketsUnfiled = 0;
  if (flaky.length > 0) {
    const now = new Date().toISOString();
    const entries = [...quarantined, ...flaky.map((s) => ({ title: s.title, addedAt: now, commit: args.commit }))];
    saveQuarantine(entries);
    for (const spec of flaky) {
      if (!fileFlakyTicket(spec.title, args.commit)) {
        ticketsUnfiled += 1;
      }
    }
    log("WARN", `flaky quarantined: ${flaky.map((s) => s.title).join(" / ")}`);
  }

  const verdict = persistent.length > 0 ? "fail" : "pass";
  const vrtDiff = persistent.some((s) => s.tags.includes(VRT_TAG));
  const notesParts = [];
  if (flaky.length > 0) notesParts.push(`flaky quarantined this run: ${flaky.map((s) => s.title).join(", ")}`);
  if (ticketsUnfiled > 0) notesParts.push(`flaky tickets NOT filed (ACCEPTANCE_TICKETS_DIR unset/missing): ${ticketsUnfiled}`);
  const payload = {
    commitSha: args.commit,
    route: "machine",
    verdict,
    decidedBy: "farm",
    decidedAt: new Date().toISOString(),
    repoName: "anytime-markdown",
    farmRunRef: path.relative(ROOT, REPORT_PATH),
    failedTests: persistent.map((s) => s.title),
    vrtDiff,
    quarantinedCount: quarantined.length + flaky.length,
    notes: notesParts.join(" / "),
  };
  const recorded = await recordToLedger(args.server, payload);
  if (!recorded) {
    // 台帳へ記録できていない結果を成功にしない（受入の主効果は記録。スプール分は次回 drain）
    log("ERROR", "ledger record failed — farm exits as not_run (2). spooled record will be drained next run");
    process.exit(2);
  }
  log("INFO", `acceptance farm done: verdict=${verdict} persistentFailures=${persistent.length} flaky=${flaky.length}`);
  process.exit(verdict === "pass" ? 0 : 1);
}

// テストから import できるよう、直接実行時のみ main を起動する
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    log("ERROR", `farm crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(2);
  });
}

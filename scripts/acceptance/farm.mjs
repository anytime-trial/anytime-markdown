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
 * S3: 記録直前にリスクルーティング（route.mjs — Trail DB 実データの決定論スコア）で経路を決定する。
 * human 経路は verdict 'pending' で記録し（合否は人の記録に譲る）、受入チケットを自動起票する。
 *
 * Usage: node scripts/acceptance/farm.mjs [--commit <sha>] [--update-baseline] [--skip-build] [--server <url>]
 * Exit: 0=pass / 1=fail / 2=not_run（ファーム実行失敗または台帳記録失敗。受入判定は人手経路へ戻す）。
 *       human 経路（pending 記録）の exit はファーム自身の機械判定に従う（赤のマージは経路に関係なく塞ぐ）
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

/** S4: ゲート合成の優先順位。いずれかが fail ならマージ阻止、fail なしで not_run ありはゲート未完（人手経路）。 */
export function mergeVerdicts(a, b) {
  if (a === "fail" || b === "fail") return "fail";
  if (a === "not_run" || b === "not_run") return "not_run";
  return "pass";
}

/**
 * S4: canary / vsix スモークの結果を machine 記録へ統合する（applicable=false は無変更）。
 * acceptance_records の PK は (commit_sha, route) のため、ゲートが独立に POST すると
 * farm の記録と UPSERT で相互破壊する — 統合された単一 payload だけが記録経路。
 */
export function applyGateReport(payload, report) {
  if (!report || !report.applicable) return payload;
  return {
    ...payload,
    verdict: mergeVerdicts(payload.verdict, report.verdict),
    failedTests: [...payload.failedTests, ...(report.failedChecks ?? [])],
    notes: [payload.notes, report.notes].filter(Boolean).join(" / "),
  };
}

/**
 * S3: ルーティング結果を payload へ適用する。auto / machine は route の差し替えのみ。
 * human は verdict を 'pending' にして合否を人の記録（同 PK の UPSERT）へ譲る —
 * farm が human 経路へ pass/fail を書くと人の本判定を先取りし miss-rate の accepted 集計も汚すため。
 */
export function applyRouting(payload, routing) {
  const scorePart = typeof routing.score === "number" ? ` score=${routing.score.toFixed(3)}` : "";
  const notes = [payload.notes, `route=${routing.route}${scorePart} (${routing.reasons.join("; ")})`]
    .filter(Boolean)
    .join(" / ");
  if (routing.route !== "human") {
    return { ...payload, route: routing.route, notes };
  }
  return {
    ...payload,
    route: "human",
    verdict: "pending",
    decidedAt: null,
    notes: `${notes} / farm verdict=${payload.verdict}`,
  };
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
  // S2: 主観品質の VLM 前処理（差分駆動 — VRT の persistent 失敗があるときのみ起動。合否権限なし）
  if (vrtDiff) {
    try {
      const { collectVrtArtifacts, resolveDocsRoot, runVlmJudge } = await import("./vlm-judge.mjs");
      const docsRoot = resolveDocsRoot(ROOT);
      const rubricPath = docsRoot ? path.join(docsRoot, "spec/10.web-app/design.md") : null;
      const artifacts = collectVrtArtifacts(path.join(WEB_APP_DIR, "test-results"));
      const judge = await runVlmJudge({ rubricPath, artifacts });
      fs.writeFileSync(path.join(WEB_APP_DIR, "test-results/vlm-judge.json"), `${JSON.stringify(judge, null, 2)}\n`);
      const vlmSummary = judge.skipped
        ? `vlm skipped (${judge.reason})`
        : `vlm judged ${judge.results.length} screen(s): ${judge.results
            .map((r) => (r.error ? `${r.name}=error` : `${r.name}=${r.score}/10`))
            .join(", ")}`;
      log("INFO", `vlm preprocessing: ${vlmSummary}`);
      notesParts.push(vlmSummary);
    } catch (e) {
      // 前処理の失敗で受入判定を壊さない（判定は決定論側が持つ）。理由は notes に残す
      const message = e instanceof Error ? e.message : String(e);
      log("WARN", `vlm preprocessing crashed: ${message}`);
      notesParts.push(`vlm crashed (${message})`);
    }
  }
  if (flaky.length > 0) notesParts.push(`flaky quarantined this run: ${flaky.map((s) => s.title).join(", ")}`);
  if (ticketsUnfiled > 0) notesParts.push(`flaky tickets NOT filed (ACCEPTANCE_TICKETS_DIR unset/missing): ${ticketsUnfiled}`);
  // S4: ループ系変更のローカルカナリア + vsix Extension Host スモーク（該当変更のみ起動・machine 記録へ統合）
  const gateReports = [];
  try {
    const canaryMod = await import("./canary.mjs");
    const vsixMod = await import("./vsix-smoke.mjs");
    const cfg = canaryMod.loadCanaryConfig();
    const changedFiles = canaryMod.listChangedFiles(args.commit);
    if (verdict === "fail") {
      // 既に不合格のマージへカナリア tick（LLM 実行）や vsce package を費やさない。skip は notes で可視化する
      if (canaryMod.matchLoopFiles(changedFiles, cfg.loopPaths).length > 0) {
        notesParts.push("canary skipped (farm already failing)");
      }
      if (vsixMod.selectVsixTargets(changedFiles, cfg.vsix).length > 0) {
        notesParts.push("vsix smoke skipped (farm already failing)");
      }
    } else {
      gateReports.push(await canaryMod.runCanary({ commit: args.commit, root: ROOT, config: cfg }));
      gateReports.push(await vsixMod.runVsixSmoke({ changedFiles, root: ROOT, config: cfg.vsix }));
    }
  } catch (e) {
    // ゲート実行体の予期しないクラッシュを fail-open にしない（not_run 扱い・人手経路へ）
    const message = e instanceof Error ? e.message : String(e);
    log("ERROR", `s4 gate crashed: ${message}`);
    gateReports.push({ applicable: true, verdict: "not_run", failedChecks: [], notes: `s4 gate crashed (${message})` });
  }
  const basePayload = {
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
  const gated = gateReports.reduce(applyGateReport, basePayload);
  // S3: リスクルーティング — machine 固定の経路を決定論スコアで置き換える（記録直前・単一 payload に統合）
  let payload = gated;
  try {
    const routeMod = await import("./route.mjs");
    const routing = await routeMod.runRouting({ commit: args.commit, root: ROOT, server: args.server });
    payload = applyRouting(gated, routing);
    if (routing.route === "human") {
      const ticket = routeMod.fileAcceptanceTicket({
        ticketsDir: TICKETS_DIR,
        commit: args.commit,
        routeResult: routing,
        farmSummary: `farm verdict=${gated.verdict} (${path.relative(ROOT, REPORT_PATH)})`,
      });
      payload = {
        ...payload,
        notes: `${payload.notes} / ${ticket.filed ? `acceptance ticket filed: ${path.basename(ticket.file)}` : `acceptance ticket NOT filed (${ticket.reason})`}`,
      };
    }
  } catch (e) {
    // ルーティング崩壊も fail-open にしない: 保守側（human・pending）へ倒して理由を残す
    const message = e instanceof Error ? e.message : String(e);
    log("ERROR", `routing crashed: ${message}`);
    payload = applyRouting(gated, { route: "human", score: null, reasons: [`routing crashed (${message}) — conservative human`] });
  }
  const recorded = await recordToLedger(args.server, payload);
  if (!recorded) {
    // 台帳へ記録できていない結果を成功にしない（受入の主効果は記録。スプール分は次回 drain）
    log("ERROR", "ledger record failed — farm exits as not_run (2). spooled record will be drained next run");
    process.exit(2);
  }
  log("INFO", `acceptance farm done: route=${payload.route} verdict=${payload.verdict} persistentFailures=${persistent.length} flaky=${flaky.length}`);
  // human 経路（pending）の exit はファーム自身の機械判定（gated.verdict）で決める — 赤のマージは経路に関係なく塞ぐ
  const exitVerdict = payload.verdict === "pending" ? gated.verdict : payload.verdict;
  process.exit(exitVerdict === "pass" ? 0 : exitVerdict === "fail" ? 1 : 2);
}

// テストから import できるよう、直接実行時のみ main を起動する
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    log("ERROR", `farm crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
    process.exit(2);
  });
}

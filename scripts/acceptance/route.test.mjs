import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { parseTicketFrontmatter } from "./canary.mjs";
import {
  classifyCategories,
  computeRiskScore,
  countMachineDecided,
  decideRoute,
  extractCouplingFiles,
  fileAcceptanceTicket,
  loadRouteConfig,
  matchCategoryFiles,
  runRouting,
} from "./route.mjs";

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

function makeRepoWithChange(targetFile) {
  const repo = mkTmpDir("route-repo-");
  git(["init", "-b", "main"], repo);
  git(["config", "user.email", "t@local"], repo);
  git(["config", "user.name", "t"], repo);
  fs.writeFileSync(path.join(repo, "README.md"), "base\n");
  git(["add", "."], repo);
  git(["commit", "-m", "base"], repo);
  const abs = path.join(repo, targetFile);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, "changed\n");
  git(["add", "."], repo);
  git(["commit", "-m", "change"], repo);
  return repo;
}

const TEST_CONFIG = {
  categories: {
    ui: ["packages/web-app/src/"],
    persistence: ["packages/trail-db/"],
    schema: ["packages/trail-core/src/domain/schema/"],
    packages: ["basename:package.json"],
    security: [".github/workflows/"],
    loop: [".claude/skills/anytime-loop-start/"],
  },
  highSeverityCategories: ["persistence", "schema", "security"],
  weights: { bugDensity: 0.35, centrality: 0.25, cochange: 0.15, category: 0.25 },
  categoryWeights: { ui: 0.3, packages: 0.5, loop: 0.5, persistence: 1, schema: 1, security: 1 },
  thresholds: { machine: 0.2, human: 0.6 },
  autoRouteEnabled: false,
  minAutoRecords: 30,
  levelGate: { windowDays: 14, missRateThreshold: 0.1, minAccepted: 5 },
  fetchTimeoutMs: 1000,
  repo: "anytime-markdown",
};

// --- 分類 ---

test("matchCategoryFiles: prefix / basename: / 完全一致の 3 形式", () => {
  const files = ["packages/web-app/src/page.tsx", "packages/web-app/package.json", "scripts/x.mjs"];
  assert.deepEqual(matchCategoryFiles(files, ["packages/web-app/src/"]), ["packages/web-app/src/page.tsx"]);
  assert.deepEqual(matchCategoryFiles(files, ["basename:package.json"]), ["packages/web-app/package.json"]);
  assert.deepEqual(matchCategoryFiles(files, ["scripts/x.mjs"]), ["scripts/x.mjs"]);
  assert.deepEqual(matchCategoryFiles(files, ["scripts/"]), ["scripts/x.mjs"]);
});

test("classifyCategories: ヒットしたカテゴリのみ返す", () => {
  const r = classifyCategories(["packages/trail-db/src/TrailDatabase.ts", "docs/readme.md"], TEST_CONFIG);
  assert.deepEqual(Object.keys(r), ["persistence"]);
});

test("loadRouteConfig: loop カテゴリは canary-config の loopPaths が注入される（単一の正）", () => {
  const cfg = loadRouteConfig();
  assert.ok(cfg.categories.loop.includes(".claude/skills/anytime-loop-start/"));
  assert.equal(cfg.autoRouteEnabled, false);
});

test("extractCouplingFiles: pairs / edges の揺れを吸収し、未知形は空", () => {
  assert.deepEqual([...extractCouplingFiles({ pairs: [{ fileA: "a.ts", fileB: "b.ts" }] })].sort(), ["a.ts", "b.ts"]);
  assert.deepEqual([...extractCouplingFiles({ edges: [{ source: "x.ts", target: "y.ts" }] })].sort(), ["x.ts", "y.ts"]);
  assert.equal(extractCouplingFiles({ entries: [{ mystery: 1 }] }).size, 0);
  assert.equal(extractCouplingFiles(null).size, 0);
});

// --- スコア ---

test("computeRiskScore: 成分の合成と欠損入力の 0 扱い", () => {
  const files = ["a.ts", "b.ts"];
  const inputs = {
    defectRisk: new Map([["a.ts", 0.8]]),
    importance: new Map([["b.ts", 0.5]]),
    coupling: new Set(["a.ts"]),
  };
  const { score, breakdown } = computeRiskScore({ files, categories: { ui: ["a.ts"] }, inputs, config: TEST_CONFIG });
  assert.equal(breakdown.bugDensity, 0.8);
  assert.equal(breakdown.centrality, 0.5);
  assert.equal(breakdown.cochange, 0.5);
  assert.equal(breakdown.category, 0.3);
  assert.ok(Math.abs(score - (0.35 * 0.8 + 0.25 * 0.5 + 0.15 * 0.5 + 0.25 * 0.3)) < 1e-9);
  // 全入力欠損 → 成分 0（カテゴリのみ）
  const empty = computeRiskScore({ files, categories: {}, inputs: {}, config: TEST_CONFIG });
  assert.equal(empty.score, 0);
});

test("countMachineDecided: pending / not_run / 他経路は実績に数えない", () => {
  assert.equal(
    countMachineDecided([
      { route: "machine", verdict: "pass" },
      { route: "machine", verdict: "fail" },
      { route: "machine", verdict: "pending" },
      { route: "machine", verdict: "not_run" },
      { route: "human", verdict: "pass" },
    ]),
    2,
  );
});

// --- 経路決定（要件 §12 の 2 条件を固定） ---

test("decideRoute: 高重大度カテゴリは score 0 でも必ず human（要件 §12）", () => {
  const r = decideRoute({ score: 0, categories: { persistence: ["x"] }, missRates: [], machineDecidedCount: 100, config: TEST_CONFIG });
  assert.equal(r.route, "human");
  assert.match(r.reasons[0], /high-severity/);
});

test("decideRoute: 既定設定では auto は発動せず machine へ縮退する（要件 §12）", () => {
  const r = decideRoute({ score: 0.05, categories: {}, missRates: [], machineDecidedCount: 100, config: TEST_CONFIG });
  assert.equal(r.route, "machine");
  assert.ok(r.reasons.some((x) => /auto route disabled/.test(x)));
});

test("decideRoute: autoRouteEnabled でも machine 実績 30 件未満なら machine（二重ガード）", () => {
  const cfg = { ...TEST_CONFIG, autoRouteEnabled: true };
  const r = decideRoute({ score: 0.05, categories: {}, missRates: [], machineDecidedCount: 29, config: cfg });
  assert.equal(r.route, "machine");
  assert.ok(r.reasons.some((x) => /auto guard/.test(x)));
  const ok = decideRoute({ score: 0.05, categories: {}, missRates: [], machineDecidedCount: 30, config: cfg });
  assert.equal(ok.route, "auto");
});

test("decideRoute: スコア閾値で machine / human を振り分ける", () => {
  assert.equal(decideRoute({ score: 0.3, categories: {}, missRates: [], machineDecidedCount: 0, config: TEST_CONFIG }).route, "machine");
  assert.equal(decideRoute({ score: 0.7, categories: {}, missRates: [], machineDecidedCount: 0, config: TEST_CONFIG }).route, "human");
});

test("decideRoute: Level Gate — machine の見逃し率が閾値超過なら human へ降格（S5 §5.3 有効化）", () => {
  const missRates = [{ route: "machine", acceptedCount: 10, missedCount: 2, missRate: 0.2, windowDays: 14 }];
  const r = decideRoute({ score: 0.3, categories: {}, missRates, machineDecidedCount: 0, config: TEST_CONFIG });
  assert.equal(r.route, "human");
  assert.ok(r.reasons.some((x) => /level gate/.test(x)));
});

test("decideRoute: Level Gate — missRate null（実績なし）と minAccepted 未満は降格しない", () => {
  const nullRate = [{ route: "machine", acceptedCount: 0, missedCount: 0, missRate: null, windowDays: 14 }];
  assert.equal(decideRoute({ score: 0.3, categories: {}, missRates: nullRate, machineDecidedCount: 0, config: TEST_CONFIG }).route, "machine");
  const fewAccepted = [{ route: "machine", acceptedCount: 4, missedCount: 4, missRate: 1, windowDays: 14 }];
  assert.equal(decideRoute({ score: 0.3, categories: {}, missRates: fewAccepted, machineDecidedCount: 0, config: TEST_CONFIG }).route, "machine");
});

// --- 受入チケット起票 ---

test("fileAcceptanceTicket: 起票内容が ticketModel 形式で、同一コミットは冪等", () => {
  const dir = mkTmpDir("route-tickets-");
  const commit = "abcdef0123456789";
  const routeResult = { route: "human", reasons: ["high-severity categories: persistence"] };
  const first = fileAcceptanceTicket({ ticketsDir: dir, commit, routeResult, farmSummary: "verdict=pass" });
  assert.equal(first.filed, true);
  const fm = parseTicketFrontmatter(fs.readFileSync(first.file, "utf8"));
  assert.equal(fm.status, "up_next");
  assert.equal(fm.assignee, "user");
  assert.equal(fm.workspace, "anytime-markdown");
  const second = fileAcceptanceTicket({ ticketsDir: dir, commit, routeResult, farmSummary: "verdict=pass" });
  assert.equal(second.filed, false);
  assert.equal(second.reason, "already filed");
  assert.equal(fs.readdirSync(dir).length, 1);
});

test("fileAcceptanceTicket: 起票先未設定・不在は skip（本番への暗黙フォールバック禁止）", () => {
  assert.equal(fileAcceptanceTicket({ ticketsDir: "", commit: "x", routeResult: { reasons: [] }, farmSummary: "" }).filed, false);
  assert.equal(fileAcceptanceTicket({ ticketsDir: "/nonexistent/dir", commit: "x", routeResult: { reasons: [] }, farmSummary: "" }).filed, false);
});

// --- 一気通貫（fetch スタブ） ---

function stubFetch(payloads, { failAll = false } = {}) {
  return async (url) => {
    if (failAll) throw new Error("connect ECONNREFUSED");
    for (const [key, payload] of Object.entries(payloads)) {
      if (url.includes(key)) return { ok: true, json: async () => payload };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test("runRouting: 入力全滅は human 縮退（fail-open 禁止）", async () => {
  const repo = makeRepoWithChange("docs/notes.md");
  const reportPath = path.join(mkTmpDir("route-report-"), "r.json");
  const r = await runRouting({ commit: "HEAD", root: repo, config: TEST_CONFIG, fetchImpl: stubFetch({}, { failAll: true }), reportPath });
  assert.equal(r.route, "human");
  assert.match(r.reasons[0], /unavailable/);
});

test("runRouting: 低リスク変更は machine（auto 無効既定）で report に監査情報が残る", async () => {
  const repo = makeRepoWithChange("docs/notes.md");
  const reportPath = path.join(mkTmpDir("route-report-"), "r.json");
  const payloads = {
    "defect-risk": { entries: [] },
    "file-analysis": { entries: [] },
    "temporal-coupling": { pairs: [] },
    "miss-rate": { missRates: [] },
    "/api/trail/acceptance": { acceptanceRecords: [] },
  };
  const r = await runRouting({ commit: "HEAD", root: repo, config: TEST_CONFIG, fetchImpl: stubFetch(payloads), reportPath });
  assert.equal(r.route, "machine");
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.route, "machine");
  assert.deepEqual(report.weights, TEST_CONFIG.weights);
  assert.equal(report.autoRouteEnabled, false);
});

test("runRouting: 永続データ変更は入力が健全でも human へ", async () => {
  const repo = makeRepoWithChange("packages/trail-db/src/TrailDatabase.ts");
  const reportPath = path.join(mkTmpDir("route-report-"), "r.json");
  const payloads = {
    "defect-risk": { entries: [] },
    "file-analysis": { entries: [] },
    "temporal-coupling": { pairs: [] },
    "miss-rate": { missRates: [] },
    "/api/trail/acceptance": { acceptanceRecords: [] },
  };
  const r = await runRouting({ commit: "HEAD", root: repo, config: TEST_CONFIG, fetchImpl: stubFetch(payloads), reportPath });
  assert.equal(r.route, "human");
});

test("runRouting: 部分欠損は当該成分 0 で続行し reasons に欠損を記録する", async () => {
  const repo = makeRepoWithChange("docs/notes.md");
  const reportPath = path.join(mkTmpDir("route-report-"), "r.json");
  const payloads = {
    "defect-risk": { entries: [] },
    "miss-rate": { missRates: [] },
    "/api/trail/acceptance": { acceptanceRecords: [] },
  };
  const r = await runRouting({ commit: "HEAD", root: repo, config: TEST_CONFIG, fetchImpl: stubFetch(payloads), reportPath });
  assert.equal(r.route, "machine");
  assert.ok(r.reasons.some((x) => /missing inputs/.test(x) && /file-analysis/.test(x)));
});

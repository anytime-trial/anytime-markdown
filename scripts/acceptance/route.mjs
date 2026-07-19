// 自律受入基盤 S3: リスクルーティングエンジン（要件書 spec/00.requirements/autonomous-acceptance-requirements.ja.md §8）。
//
// develop マージの変更セットから決定論リスクスコアを算出し、受入経路（auto / machine / human）を
// 振り分ける。入力は Trail DB の実データのみ（LLM 不使用）:
//   - bug 履歴密度: GET /api/defect-risk（score 0-1）
//   - God Node / 中心性: GET /api/c4/file-analysis（importanceScore）
//   - cochange 結合: GET /api/temporal-coupling
//   - Level Gate: GET /api/trail/acceptance/miss-rate（経路別見逃し率。閾値超過で human へ降格 — S5 §5.3 の有効化）
//   - auto 実績ガード: GET /api/trail/acceptance（machine 実績件数）
//
// 経路の記録は farm.mjs の単一 machine 記録に統合される（route 列を差し替え。台帳 PK
// (commit_sha, route) のため独立 POST は相互破壊する — S4 と同じ方針）。
// human 経路は verdict 'pending' で記録し、合否は人の記録（同 PK の UPSERT）に譲る。
// TrailDataServer 不達・入力全滅時は human へ縮退する（根拠なしの auto/machine は fail-open）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { listChangedFiles, loadCanaryConfig } from "./canary.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONFIG_PATH = path.join(ROOT, "scripts/acceptance/route-config.json");
const REPORT_PATH = path.join(ROOT, "packages/web-app/test-results/route-report.json");
const DEFAULT_SERVER = process.env.TRAIL_SERVER_URL ?? "http://127.0.0.1:19841";

function log(level, msg) {
  console.log(`[${new Date().toISOString()}] [${level}] [route] ${msg}`);
}

/**
 * 設定ロード。loop カテゴリは canary-config の loopPaths を単一の正として注入する
 * （route-config への複製は将来の乖離源になるため持たない）。
 */
export function loadRouteConfig(configPath = CONFIG_PATH, canaryConfigPath) {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const canary = loadCanaryConfig(canaryConfigPath);
  return {
    ...raw,
    categories: { ...raw.categories, loop: canary.loopPaths },
  };
}

/** パターン: 末尾 "/" = prefix / "basename:<name>" = ファイル名一致 / それ以外 = 完全一致（glob なし・決定論）。 */
export function matchCategoryFiles(files, patterns) {
  return files.filter((f) =>
    (patterns ?? []).some((p) => {
      if (p.endsWith("/")) return f.startsWith(p);
      if (p.startsWith("basename:")) return path.basename(f) === p.slice("basename:".length);
      return f === p;
    }),
  );
}

/** 変更ファイルを設定カテゴリへ分類する。ヒットしたカテゴリのみ（カテゴリ名 → 該当ファイル）で返す。 */
export function classifyCategories(files, config) {
  const result = {};
  for (const [name, patterns] of Object.entries(config.categories ?? {})) {
    const hit = matchCategoryFiles(files, patterns);
    if (hit.length > 0) result[name] = hit;
  }
  return result;
}

async function fetchJson(url, { timeoutMs, fetchImpl = fetch }) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

/** temporal-coupling 応答から結合ペアのファイルパス集合を寛容に取り出す（pairs / edges / entries の揺れを吸収）。 */
export function extractCouplingFiles(payload) {
  const items = payload?.pairs ?? payload?.edges ?? payload?.entries ?? [];
  const files = new Set();
  for (const item of items) {
    for (const key of ["fileA", "fileB", "source", "target", "from", "to"]) {
      if (typeof item?.[key] === "string") files.add(item[key]);
    }
  }
  if (items.length > 0 && files.size === 0) {
    log("WARN", "temporal-coupling payload shape unrecognized — cochange component treated as 0");
  }
  return files;
}

/** file-analysis 応答から filePath → importanceScore(0-1) を取り出す。 */
export function extractImportanceScores(payload) {
  const map = new Map();
  for (const e of payload?.entries ?? []) {
    if (typeof e?.filePath === "string" && typeof e?.importanceScore === "number") {
      map.set(e.filePath, e.importanceScore);
    }
  }
  return map;
}

/**
 * リスク入力を取得する。各ソースは独立に失敗しうる（部分欠損 = 当該成分 0 + missing 記録）。
 * 4 つのリスク成分ソースが全滅した場合のみ allMissing（human 縮退の判断材料）。
 */
export async function fetchRiskInputs({ server = DEFAULT_SERVER, config, fetchImpl = fetch }) {
  const timeoutMs = config.fetchTimeoutMs ?? 10000;
  const repo = encodeURIComponent(config.repo ?? "anytime-markdown");
  const missing = [];
  const get = async (name, url, extract) => {
    try {
      return extract(await fetchJson(url, { timeoutMs, fetchImpl }));
    } catch (e) {
      missing.push(name);
      log("WARN", `risk input ${name} unavailable: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  };
  const defectRisk = await get("defect-risk", `${server}/api/defect-risk?repo=${repo}`, (p) => {
    const map = new Map();
    for (const e of p?.entries ?? []) {
      if (typeof e?.filePath === "string" && typeof e?.score === "number") map.set(e.filePath, e.score);
    }
    return map;
  });
  const importance = await get("file-analysis", `${server}/api/c4/file-analysis?repo=${repo}`, extractImportanceScores);
  const coupling = await get("temporal-coupling", `${server}/api/temporal-coupling?repo=${repo}`, extractCouplingFiles);
  const missRates = await get("miss-rate", `${server}/api/trail/acceptance/miss-rate?windowDays=${config.levelGate?.windowDays ?? 14}`, (p) => p?.missRates ?? []);
  const acceptance = await get("acceptance-records", `${server}/api/trail/acceptance`, (p) => p?.acceptanceRecords ?? []);
  return {
    defectRisk,
    importance,
    coupling,
    missRates,
    acceptance,
    missing,
    allMissing: defectRisk === null && importance === null && coupling === null && missRates === null,
  };
}

function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}

/**
 * 決定論リスクスコア（0-1）。成分: bug 履歴密度（変更ファイルの defect score 最大値）・
 * 中心性（importanceScore 最大値）・cochange（結合ペア該当ファイル比率）・カテゴリ重み。
 * 欠損した入力の成分は 0（notes 側で欠損を可視化する — 静かな 0 にしない）。
 */
export function computeRiskScore({ files, categories, inputs, config }) {
  const w = config.weights ?? {};
  const cw = config.categoryWeights ?? {};
  const bugDensity = inputs.defectRisk
    ? Math.max(0, ...files.map((f) => inputs.defectRisk.get(f) ?? 0))
    : 0;
  const centrality = inputs.importance
    ? Math.max(0, ...files.map((f) => clamp01(inputs.importance.get(f) ?? 0)))
    : 0;
  const cochange = inputs.coupling && files.length > 0
    ? files.filter((f) => inputs.coupling.has(f)).length / files.length
    : 0;
  const category = clamp01(
    Object.keys(categories).reduce((sum, name) => sum + (cw[name] ?? 0), 0),
  );
  const score = clamp01(
    (w.bugDensity ?? 0) * bugDensity +
      (w.centrality ?? 0) * centrality +
      (w.cochange ?? 0) * cochange +
      (w.category ?? 0) * category,
  );
  return { score, breakdown: { bugDensity, centrality, cochange, category } };
}

/** auto 経路の実績ガード: machine 経路で合否が確定した記録の件数（pending / not_run は実績に数えない）。 */
export function countMachineDecided(acceptanceRecords) {
  return (acceptanceRecords ?? []).filter(
    (r) => r?.route === "machine" && (r?.verdict === "pass" || r?.verdict === "fail"),
  ).length;
}

/**
 * 経路決定。優先順位:
 *  (1) 高重大度カテゴリ該当 → 無条件 human（要件 §12: 必ず human）
 *  (2) スコア閾値で base 経路（auto / machine / human）
 *  (3) Level Gate: base 経路の見逃し率が閾値超過（missRate ≠ null かつ実績 minAccepted 以上）→ human 降格
 *  (4) auto は autoRouteEnabled（人が設定）AND machine 実績 ≥ minAutoRecords の二重ガード成立時のみ。不成立は machine
 */
export function decideRoute({ score, categories, missRates, machineDecidedCount, config }) {
  const reasons = [];
  const highSeverity = (config.highSeverityCategories ?? []).filter((c) => c in categories);
  if (highSeverity.length > 0) {
    reasons.push(`high-severity categories: ${highSeverity.join(",")}`);
    return { route: "human", reasons };
  }
  const t = config.thresholds ?? { machine: 0.2, human: 0.6 };
  let route = score >= t.human ? "human" : score >= t.machine ? "machine" : "auto";
  reasons.push(`score=${score.toFixed(3)} -> ${route}`);

  const gate = config.levelGate ?? {};
  const rate = (missRates ?? []).find((m) => m?.route === route);
  if (
    route !== "human" &&
    rate &&
    rate.missRate !== null &&
    rate.missRate !== undefined &&
    rate.acceptedCount >= (gate.minAccepted ?? 5) &&
    rate.missRate > (gate.missRateThreshold ?? 0.1)
  ) {
    reasons.push(`level gate: ${route} missRate=${rate.missRate.toFixed(3)} > ${gate.missRateThreshold} — demoted to human`);
    return { route: "human", reasons };
  }

  if (route === "auto") {
    if (!config.autoRouteEnabled) {
      reasons.push("auto route disabled by config — fallback to machine");
      route = "machine";
    } else if ((machineDecidedCount ?? 0) < (config.minAutoRecords ?? 30)) {
      reasons.push(`auto guard: machine decided records ${machineDecidedCount} < ${config.minAutoRecords ?? 30} — fallback to machine`);
      route = "machine";
    } else {
      reasons.push("auto route enabled (config + record guard satisfied)");
    }
  }
  return { route, reasons };
}

const HUMAN_TEST_ITEMS = [
  "実 IME での入力確認（合成イベントとの乖離有無）",
  "印刷プレビュー・実プリンタ出力の目視確認",
  "対象画面の主観品質（デザインシステム準拠）確認",
  "変更領域の実機回帰（インストール済み拡張のバンドル配信で確認）",
];

/**
 * human 経路の受入チケットを起票する（要件 §8）。ACCEPTANCE_TICKETS_DIR 明示時のみ
 * （本番チケットストアへの暗黙フォールバック禁止 — farm.mjs fileFlakyTicket と同方針）。
 * 冪等: 同一コミットの起票済みチケット（ファイル名の -acceptance-<sha12> で判定）があれば起票しない。
 */
export function fileAcceptanceTicket({ ticketsDir, commit, routeResult, farmSummary }) {
  if (!ticketsDir) {
    log("WARN", "ACCEPTANCE_TICKETS_DIR is not set — acceptance ticket not filed (human route)");
    return { filed: false, reason: "tickets dir unset" };
  }
  if (!fs.existsSync(ticketsDir)) {
    log("WARN", `tickets dir not found, skip acceptance ticket: ${ticketsDir}`);
    return { filed: false, reason: "tickets dir missing" };
  }
  const sha12 = commit.slice(0, 12);
  const existing = fs.readdirSync(ticketsDir).find((n) => n.endsWith(`-acceptance-${sha12}.md`));
  if (existing) {
    log("INFO", `acceptance ticket already filed for ${sha12}: ${existing}`);
    return { filed: false, reason: "already filed", file: existing };
  }
  const now = new Date().toISOString();
  // id はサーバー採番と衝突しないエポック秒ベース（fileFlakyTicket と同方式。恒久採番は別課題）
  const id = `T-${Math.floor(Date.now() / 1000)}`;
  const file = path.join(ticketsDir, `${id}-acceptance-${sha12}.md`);
  const body = [
    "---",
    `id: ${id}`,
    `title: "受入確認（human 経路）: ${sha12}"`,
    "status: up_next",
    "priority: high",
    "assignee: user",
    "workspace: anytime-markdown",
    "creator: acceptance-farm",
    `created_at: "${now}"`,
    `updated_at: "${now}"`,
    "---",
    "",
    "## 概要 (Description)",
    "",
    `リスクルーティング（scripts/acceptance/route.mjs）が develop マージ ${commit} を human 経路へ振り分けた。`,
    `判定理由: ${routeResult.reasons.join(" / ")}`,
    "",
    `ファーム結果: ${farmSummary}`,
    "",
    "受入合否は本チケットの確認完了後、台帳（acceptance_records の commit×human）へ人が記録する。",
    "",
    "## 作業タスクリスト (Subtasks)",
    "",
    ...HUMAN_TEST_ITEMS.map((t) => `- [ ] ${t}`),
    "- [ ] 台帳へ合否を記録（pass / fail）",
    "",
  ].join("\n");
  fs.writeFileSync(file, body);
  log("INFO", `acceptance ticket filed: ${file}`);
  return { filed: true, file };
}

/**
 * ルーティング本体。farm から記録直前に呼ばれる。
 * 返り値: { route, score, breakdown, reasons, categories, missing }
 * TrailDataServer 不達（入力全滅）は human 縮退（fail-open 禁止）。
 */
export async function runRouting({ commit, root = ROOT, server = DEFAULT_SERVER, config, fetchImpl = fetch, reportPath = REPORT_PATH }) {
  const cfg = config ?? loadRouteConfig();
  const files = listChangedFiles(commit, root);
  const categories = classifyCategories(files, cfg);
  const inputs = await fetchRiskInputs({ server, config: cfg, fetchImpl });

  let result;
  let score = null;
  let breakdown = null;
  if (inputs.allMissing) {
    result = { route: "human", reasons: ["risk inputs unavailable (TrailDataServer unreachable?) — conservative human"] };
  } else {
    ({ score, breakdown } = computeRiskScore({ files, categories, inputs, config: cfg }));
    result = decideRoute({
      score,
      categories,
      missRates: inputs.missRates,
      machineDecidedCount: countMachineDecided(inputs.acceptance),
      config: cfg,
    });
    if (inputs.missing.length > 0) result.reasons.push(`missing inputs treated as 0: ${inputs.missing.join(",")}`);
  }

  const report = {
    commit,
    route: result.route,
    score,
    breakdown,
    reasons: result.reasons,
    categories: Object.fromEntries(Object.entries(categories).map(([k, v]) => [k, v.length])),
    weights: cfg.weights,
    categoryWeights: cfg.categoryWeights,
    thresholds: cfg.thresholds,
    levelGate: cfg.levelGate,
    autoRouteEnabled: cfg.autoRouteEnabled,
    missingInputs: inputs.missing,
  };
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  } catch (e) {
    log("WARN", `route report write failed (${reportPath}): ${e instanceof Error ? e.message : String(e)}`);
  }
  log("INFO", `routing: ${result.route} (${result.reasons.join(" / ")})`);
  return { ...result, score, breakdown, categories, missing: inputs.missing };
}

// 単体実行: node scripts/acceptance/route.mjs --commit <sha> [--server <url>]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argAt = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i >= 0 ? process.argv[i + 1] : fallback;
  };
  runRouting({ commit: argAt("--commit", "HEAD"), server: argAt("--server", DEFAULT_SERVER) })
    .then((r) => {
      log("INFO", `route done: ${r.route}`);
    })
    .catch((e) => {
      log("ERROR", `routing crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      process.exit(2);
    });
}

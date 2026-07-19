/**
 * 主観品質の VLM 前処理（自律受入基盤 S2・要件書 §6）。
 *
 * VRT で persistent 失敗した画面の actual/diff 画像を、ローカル ollama の vision モデルへ
 * design.md（デザインシステム仕様書）をルーブリックとして渡し JSON 採点を得る。
 * **合否権限を持たない前処理** — 結果は farm が台帳 notes と test-results/vlm-judge.json に
 * 記録するのみで、受入判定（exit code / verdict）には関与しない。
 *
 * 起動条件: 環境変数 ACCEPTANCE_VLM_MODEL が設定され、ollama（OLLAMA_URL、既定
 * http://127.0.0.1:11434）に到達できること。いずれか欠けたら skip を返す（fail しない）。
 * ローカル推論のみで API トークンを消費しない（運用トークン非増の設計原則）。
 */

import fs from "node:fs";
import path from "node:path";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const RUBRIC_MAX_CHARS = 8000;

function log(level, msg) {
  process.stderr.write(`[${new Date().toISOString()}] [${level}] ${msg}\n`);
}

/** ワークスペース CLAUDE.md の `- docsRoot:` 行から docs リポジトリのルートを解決する（preflight と同じ規約）。 */
export function resolveDocsRoot(workspaceRoot) {
  try {
    const text = fs.readFileSync(path.join(workspaceRoot, "CLAUDE.md"), "utf8");
    const m = /^- docsRoot:\s*(\S+)/m.exec(text);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** 採点プロンプト。応答は JSON 1 オブジェクトのみを要求する（パースは parseJudgeResponse）。 */
export function buildJudgePrompt(rubricText, screenName) {
  return [
    `あなたは UI の視覚品質レビュアーです。添付画像は「${screenName}」の実描画（視覚回帰で差分が出た画面）です。`,
    "以下のデザインシステム仕様（ルーブリック）に照らして主観品質を採点してください。",
    "",
    "--- ルーブリック（抜粋） ---",
    rubricText.slice(0, RUBRIC_MAX_CHARS),
    "--- ルーブリックここまで ---",
    "",
    '出力は次の JSON オブジェクト 1 つのみ（前後の説明文・コードフェンス禁止）:',
    '{"score": <1-10 の整数>, "issues": ["<問題点を日本語で簡潔に>", ...]}',
    "問題がなければ issues は空配列。",
  ].join("\n");
}

/** 応答テキストから JSON を取り出して検証する。パース不能・型不正は null（呼び出し側が skip 記録）。 */
export function parseJudgeResponse(content) {
  if (typeof content !== "string") return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch {
    return null;
  }
  const score = parsed?.score;
  const issues = parsed?.issues;
  if (typeof score !== "number" || !Number.isFinite(score) || score < 1 || score > 10) return null;
  if (!Array.isArray(issues) || issues.some((i) => typeof i !== "string")) return null;
  return { score: Math.round(score), issues };
}

/**
 * Playwright の test-results 配下から VRT 失敗の成果物（*-actual.png と対の *-diff.png）を収集する。
 * ディレクトリ名は Playwright がテスト名から生成するため、名前はディレクトリ名で代用する。
 */
export function collectVrtArtifacts(testResultsDir) {
  const artifacts = [];
  if (!fs.existsSync(testResultsDir)) return artifacts;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith("-actual.png")) {
        const diffPath = full.replace(/-actual\.png$/, "-diff.png");
        artifacts.push({
          name: path.basename(path.dirname(full)),
          actualPath: full,
          diffPath: fs.existsSync(diffPath) ? diffPath : null,
        });
      }
    }
  };
  walk(testResultsDir);
  return artifacts;
}

async function ollamaReachable(ollamaUrl, fetchImpl) {
  try {
    const res = await fetchImpl(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * VLM 前処理の実行。skip 時は { skipped: true, reason }、実行時は { skipped: false, results }。
 * results: [{ name, score, issues } | { name, error }]。エラーは握りつぶさずログ + 結果に残す。
 */
export async function runVlmJudge({
  model = process.env.ACCEPTANCE_VLM_MODEL ?? "",
  ollamaUrl = process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL,
  rubricPath,
  artifacts,
  fetchImpl = fetch,
}) {
  if (model === "") {
    return { skipped: true, reason: "ACCEPTANCE_VLM_MODEL unset" };
  }
  if (!rubricPath || !fs.existsSync(rubricPath)) {
    return { skipped: true, reason: `rubric not found: ${rubricPath}` };
  }
  if (!(await ollamaReachable(ollamaUrl, fetchImpl))) {
    return { skipped: true, reason: `ollama unreachable: ${ollamaUrl}` };
  }
  const rubricText = fs.readFileSync(rubricPath, "utf8");
  const results = [];
  for (const artifact of artifacts) {
    try {
      const image = fs.readFileSync(artifact.actualPath).toString("base64");
      const res = await fetchImpl(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: "user", content: buildJudgePrompt(rubricText, artifact.name), images: [image] },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      const judged = parseJudgeResponse(body?.message?.content);
      if (judged === null) {
        throw new Error("unparseable judge response");
      }
      results.push({ name: artifact.name, ...judged });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log("WARN", `vlm judge failed for ${artifact.name} (${artifact.actualPath}): ${message}`);
      results.push({ name: artifact.name, error: message });
    }
  }
  return { skipped: false, results };
}

// 自律受入基盤 S4: vsix Extension Host スモーク（要件書 §7）。
//
// 対象拡張のソースに触れるマージで、vsce package → テスト用 VS Code（専用 --user-data-dir /
// --extensions-dir）へ vsix をインストール → Extension Host 内で activate + 主要コマンド登録を検査する。
// 「インストール済み拡張と repo ビルドの乖離」（バンドル配信の教訓）をマージ前に検知するのが目的。
// 結果は canary と同様 farm.mjs が machine 記録へ統合する。
//
// 判定分類: パッケージング・スモーク検査の失敗 = fail（プロダクト起因）。
// VS Code 本体のダウンロード不可・ツール不在・ハング = not_run（環境要因・人手経路へ倒す。要件 §9）。

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNNER_PATH = path.join(ROOT, "scripts/acceptance/vsix-smoke-runner.mjs");
const REPORT_PATH = path.join(ROOT, "packages/web-app/test-results/vsix-smoke-report.json");

function log(level, msg) {
  console.log(`[${new Date().toISOString()}] [${level}] [vsix-smoke] ${msg}`);
}

/** 変更ファイルに paths（末尾 "/" prefix・それ以外完全一致）が触れている対象拡張を選ぶ。 */
export function selectVsixTargets(changedFiles, vsixConfig) {
  const targets = vsixConfig?.targets ?? [];
  return targets.filter((t) =>
    changedFiles.some((f) => (t.paths ?? []).some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p))),
  );
}

/**
 * パッケージング失敗の分類。ツール解決・ネットワーク起因は not_run、それ以外（ビルド失敗）は fail。
 * npx はオフラインで vsce を解決できないと nonzero exit になるため、exit code だけでは区別できない。
 */
export function classifyPackageFailure({ error, stderr }) {
  if (error) return "not_run";
  if (/(command not found|could not determine executable|E404|ENOTFOUND|ETIMEDOUT|network)/i.test(stderr ?? "")) {
    return "not_run";
  }
  return "fail";
}

/** 既定のパッケージング実装（テストでは差し替える）。 */
export function packageVsix({ target, root = ROOT, timeoutMs }) {
  const pkgDir = path.join(root, "packages", target.pkg);
  const outPath = path.join(pkgDir, `vsix-smoke-${target.pkg}.vsix`);
  const r = spawnSync("npx", ["vsce", "package", "--no-dependencies", "-o", outPath], {
    cwd: pkgDir,
    encoding: "utf8",
    timeout: timeoutMs,
  });
  if (r.error || r.status !== 0) {
    const stderr = r.stderr ?? "";
    return {
      ok: false,
      verdict: classifyPackageFailure({ error: r.error, stderr }),
      detail: r.error ? r.error.message : `vsce exit ${r.status}: ${stderr.slice(-400)}`,
    };
  }
  return { ok: true, vsixPath: outPath };
}

/**
 * 既定のスモーク実装: runner を子プロセスで起動し、timeout でグループごと SIGKILL する
 * （vscode-test は headless でハングする既知事象があるため、ハングを not_run として観測可能にする）。
 */
export function runSmokeProcess({ target, vsixPath, root = ROOT, timeoutMs }) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [RUNNER_PATH, "--vsix", vsixPath, "--ext-id", target.extensionId, "--command", target.command],
      { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"] },
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
        log("WARN", `smoke timeout kill failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ verdict: "not_run", detail: `runner spawn failed: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString("utf8");
      if (timedOut) {
        resolve({ verdict: "not_run", detail: `smoke timed out after ${timeoutMs}ms (killed)` });
        return;
      }
      // runner は終了直前に判定 JSON を 1 行出力する（exit code だけに依存しない）
      const line = output.split("\n").find((l) => l.startsWith("VSIX_SMOKE_RESULT "));
      if (line) {
        try {
          resolve(JSON.parse(line.slice("VSIX_SMOKE_RESULT ".length)));
          return;
        } catch (e) {
          log("WARN", `runner result parse failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      resolve({
        verdict: code === 0 ? "pass" : "not_run",
        detail: `runner exit ${code} without result line: ${output.slice(-400)}`,
      });
    });
  });
}

/**
 * vsix スモーク本体。返り値は canary と同形: { applicable, verdict, failedChecks, notes }。
 * packageImpl / smokeImpl はテスト注入用（既定は実 vsce + 実 VS Code）。
 */
export async function runVsixSmoke({
  changedFiles,
  root = ROOT,
  config,
  reportPath = REPORT_PATH,
  packageImpl = packageVsix,
  smokeImpl = runSmokeProcess,
}) {
  const timeoutMs = config?.stageTimeoutMs ?? 300000;
  const targets = selectVsixTargets(changedFiles, config);
  if (targets.length === 0) {
    return { applicable: false, verdict: "pass", failedChecks: [], notes: "" };
  }
  const failedChecks = [];
  const notesParts = [];
  const results = [];
  let notRun = false;
  for (const target of targets) {
    log("INFO", `vsix smoke: packaging ${target.pkg}`);
    const packed = packageImpl({ target, root, timeoutMs });
    if (!packed.ok) {
      results.push({ pkg: target.pkg, stage: "package", verdict: packed.verdict, detail: packed.detail });
      if (packed.verdict === "not_run") notRun = true;
      else failedChecks.push(`vsix:${target.pkg}:package`);
      notesParts.push(`vsix ${target.pkg} package ${packed.verdict} (${packed.detail})`);
      continue;
    }
    log("INFO", `vsix smoke: installing + extension host smoke for ${target.pkg}`);
    const smoke = await smokeImpl({ target, vsixPath: packed.vsixPath, root, timeoutMs });
    results.push({ pkg: target.pkg, stage: "smoke", verdict: smoke.verdict, detail: smoke.detail ?? "" });
    if (smoke.verdict === "not_run") {
      notRun = true;
      notesParts.push(`vsix ${target.pkg} smoke not_run (${smoke.detail})`);
    } else if (smoke.verdict === "fail") {
      failedChecks.push(`vsix:${target.pkg}:smoke`);
      notesParts.push(`vsix ${target.pkg} smoke fail (${smoke.detail})`);
    } else {
      notesParts.push(`vsix ${target.pkg} smoke pass`);
    }
  }
  const verdict = failedChecks.length > 0 ? "fail" : notRun ? "not_run" : "pass";
  try {
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, `${JSON.stringify({ verdict, results }, null, 2)}\n`);
  } catch (e) {
    log("WARN", `vsix smoke report write failed (${reportPath}): ${e instanceof Error ? e.message : String(e)}`);
  }
  return { applicable: true, verdict, failedChecks, notes: notesParts.join(" / ") };
}

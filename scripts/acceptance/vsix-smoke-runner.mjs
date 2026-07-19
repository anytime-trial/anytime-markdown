// vsix スモークの実行体（vsix-smoke.mjs から子プロセスとして起動される）。
// VS Code 本体の取得・vsix インストール・Extension Host スモークを行い、
// 終了直前に判定 JSON を 1 行（VSIX_SMOKE_RESULT {...}）出力する。
// 親側がプロセスグループ kill でハングを制御できるよう、本体処理はこの別プロセスに閉じる。
//
// 判定分類: ダウンロード・CLI 解決の失敗 = not_run（環境）。インストール・スモーク検査の失敗 = fail。

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRY_PATH = path.join(ROOT, "scripts/acceptance/vsix-smoke-entry.cjs");

function emit(result) {
  console.log(`VSIX_SMOKE_RESULT ${JSON.stringify(result)}`);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const vsixPath = arg("--vsix");
  const extensionId = arg("--ext-id");
  const command = arg("--command");
  if (!vsixPath || !extensionId || !command) {
    emit({ verdict: "not_run", detail: "runner args missing (--vsix / --ext-id / --command)" });
    process.exit(3);
  }

  let testElectron;
  try {
    testElectron = await import("@vscode/test-electron");
  } catch (e) {
    emit({ verdict: "not_run", detail: `@vscode/test-electron unavailable: ${e instanceof Error ? e.message : String(e)}` });
    process.exit(3);
  }

  let exe;
  try {
    exe = await testElectron.downloadAndUnzipVSCode({ cachePath: path.join(ROOT, ".vscode-test") });
  } catch (e) {
    emit({ verdict: "not_run", detail: `VS Code download failed: ${e instanceof Error ? e.message : String(e)}` });
    process.exit(3);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vsix-smoke-"));
  const userDataDir = path.join(tmp, "user-data");
  const extensionsDir = path.join(tmp, "extensions");
  const stubDir = path.join(tmp, "stub-extension");
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(extensionsDir, { recursive: true });
  fs.mkdirSync(stubDir, { recursive: true });
  // extensionDevelopmentPath は必須引数のため、何もしない宣言のみのスタブ拡張を渡す
  // （検査対象は vsix でインストールした側であり、開発モード拡張ではない）
  fs.writeFileSync(
    path.join(stubDir, "package.json"),
    `${JSON.stringify({ name: "vsix-smoke-stub", publisher: "local", version: "0.0.0", engines: { vscode: "*" } }, null, 2)}\n`,
  );

  try {
    const [cli, ...cliArgs] = testElectron.resolveCliArgsFromVSCodeExecutablePath(exe);
    execFileSync(cli, [...cliArgs, "--install-extension", vsixPath, "--user-data-dir", userDataDir, "--extensions-dir", extensionsDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    emit({ verdict: "fail", detail: `vsix install failed: ${e instanceof Error ? e.message : String(e)}` });
    process.exit(1);
  }

  try {
    await testElectron.runTests({
      vscodeExecutablePath: exe,
      extensionDevelopmentPath: stubDir,
      extensionTestsPath: ENTRY_PATH,
      launchArgs: [
        "--user-data-dir",
        userDataDir,
        "--extensions-dir",
        extensionsDir,
        "--disable-workspace-trust",
        "--skip-welcome",
        "--skip-release-notes",
      ],
      extensionTestsEnv: { VSIX_SMOKE_EXT_ID: extensionId, VSIX_SMOKE_COMMAND: command },
    });
    emit({ verdict: "pass", detail: `${extensionId} activated and ${command} registered` });
    process.exit(0);
  } catch (e) {
    emit({ verdict: "fail", detail: `extension host smoke failed: ${e instanceof Error ? e.message : String(e)}` });
    process.exit(1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  emit({ verdict: "not_run", detail: `runner crashed: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}` });
  process.exit(3);
});

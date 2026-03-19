/**
 * VS Code を Playwright Electron で起動し、操作手順のスクリーンショットを撮影する。
 *
 * 使用方法:
 *   npx tsx scripts/demo-gif/capture.ts [scenario-name]
 *
 * 前提:
 *   - VS Code がローカルにインストールされている
 *   - Playwright がインストール済み
 *   - 拡張機能がビルド済み (npm run package)
 *
 * 出力:
 *   scripts/demo-gif/output/{scenario-name}/ にスクリーンショット連番を保存
 */

import { _electron as electron } from "playwright";
import * as path from "path";
import * as fs from "fs";

// VS Code の実行パス（環境に応じて変更）
const VSCODE_PATH = process.env.VSCODE_PATH || "/usr/bin/code";
const EXTENSION_PATH = path.resolve(__dirname, "../../packages/vscode-extension");
const OUTPUT_DIR = path.resolve(__dirname, "output");

interface CaptureStep {
  /** ステップの説明 */
  label: string;
  /** 実行するアクション */
  action: (page: Awaited<ReturnType<Awaited<ReturnType<typeof electron.launch>>["firstWindow"]>>) => Promise<void>;
  /** スクリーンショット前の待機時間（ms） */
  delay?: number;
}

/**
 * シナリオを定義して実行する。
 * 各ステップでスクリーンショットを撮影。
 */
async function runScenario(name: string, steps: CaptureStep[]) {
  const outputDir = path.join(OUTPUT_DIR, name);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log(`Launching VS Code with extension: ${EXTENSION_PATH}`);

  const app = await electron.launch({
    executablePath: VSCODE_PATH,
    args: [
      `--extensionDevelopmentPath=${EXTENSION_PATH}`,
      "--disable-extensions",
      "--new-window",
      "--skip-welcome",
      "--skip-release-notes",
      "--disable-workspace-trust",
    ],
    timeout: 30000,
  });

  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  console.log("VS Code launched");

  // 初期画面のスクリーンショット
  await window.waitForTimeout(3000);
  await window.screenshot({ path: path.join(outputDir, "000-initial.png") });
  console.log("  [000] Initial screenshot");

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    console.log(`  [${String(i + 1).padStart(3, "0")}] ${step.label}`);

    await step.action(window);
    await window.waitForTimeout(step.delay ?? 1000);

    const filename = `${String(i + 1).padStart(3, "0")}-${step.label.replace(/[^a-zA-Z0-9]/g, "_")}.png`;
    await window.screenshot({ path: path.join(outputDir, filename) });
  }

  console.log(`Screenshots saved to: ${outputDir}`);
  console.log(`Total: ${steps.length + 1} frames`);
  console.log(`\nTo create GIF, run:\n  npx tsx scripts/demo-gif/create-gif.ts ${name}`);

  await app.close();
}

// --- シナリオ定義 ---

const scenarios: Record<string, CaptureStep[]> = {
  /** 基本操作デモ: ファイルを開いてテキストを入力 */
  "basic-editing": [
    {
      label: "Open markdown file",
      action: async (page) => {
        await page.keyboard.press("Control+Shift+p");
        await page.waitForTimeout(500);
        await page.keyboard.type("Anytime");
        await page.waitForTimeout(500);
      },
      delay: 2000,
    },
    {
      label: "Type heading",
      action: async (page) => {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(500);
      },
      delay: 1000,
    },
  ],

  /** 比較モードデモ */
  "compare-mode": [
    {
      label: "Open compare mode",
      action: async (page) => {
        await page.keyboard.press("Control+Shift+p");
        await page.waitForTimeout(500);
        await page.keyboard.type("compare");
        await page.waitForTimeout(500);
      },
      delay: 2000,
    },
  ],
};

// --- 実行 ---

const scenarioName = process.argv[2] || "basic-editing";
const scenario = scenarios[scenarioName];
if (!scenario) {
  console.error(`Unknown scenario: ${scenarioName}`);
  console.error(`Available: ${Object.keys(scenarios).join(", ")}`);
  process.exit(1);
}

runScenario(scenarioName, scenario).catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});

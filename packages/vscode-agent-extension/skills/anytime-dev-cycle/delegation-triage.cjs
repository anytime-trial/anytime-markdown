#!/usr/bin/env node
// anytime-dev-cycle の Codex 委譲可否を客観入力から判定する。
//
// 使い方（ワークスペースルートで実行）:
//   node delegation-triage.cjs --paths <p1,p2,...> --files <n> --lines <n>
//     [--severity low|medium|high] [--verify "<cmd>"] [--interactive-design "<理由>"]
//     [--workspace <dir>] [--json]
//
// 終了コード: 0 = 判定成功（main / codex 共通）/ 2 = 引数不備

const fs = require('node:fs');
const path = require('node:path');

const NPM_LIFECYCLE_SHORTHANDS = new Set(['test', 'start', 'stop', 'restart']);

const USAGE =
  '使い方: node delegation-triage.cjs --paths <p1,p2,...> --files <n> --lines <n> ' +
  '[--severity low|medium|high] [--verify "<cmd>"] [--interactive-design "<理由>"] ' +
  '[--workspace <dir>] [--json]';

class ArgumentError extends Error {}

/** CLI 引数を検証済みの入力値へ変換する。 */
function parseArgs(argv) {
  const values = {};
  const valueOptions = new Set([
    '--paths',
    '--files',
    '--lines',
    '--severity',
    '--verify',
    '--interactive-design',
    '--workspace',
  ]);

  for (let i = 0; i < argv.length; i += 1) {
    const option = argv[i];
    if (option === '--json') {
      values.json = true;
      continue;
    }
    if (!valueOptions.has(option)) throw new ArgumentError(`未知のオプションです: ${option}`);
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      throw new ArgumentError(`${option} の値がありません`);
    }
    values[option] = argv[i + 1];
    i += 1;
  }

  const parseCount = (option) => {
    if (!(option in values)) throw new ArgumentError(`${option} は必須です`);
    const number = Number(values[option]);
    if (!Number.isFinite(number) || number < 0) {
      throw new ArgumentError(`${option} は 0 以上の数値で指定してください`);
    }
    return number;
  };

  const severity = values['--severity'] ?? 'low';
  if (!['low', 'medium', 'high'].includes(severity)) {
    throw new ArgumentError(`--severity の値が不正です: ${severity}`);
  }

  return {
    paths: (values['--paths'] ?? '').split(',').map((p) => p.trim()).filter(Boolean),
    files: parseCount('--files'),
    lines: parseCount('--lines'),
    severity,
    verify: values['--verify'] ?? null,
    interactiveDesign: values['--interactive-design'] ?? null,
    workspace: path.resolve(values['--workspace'] ?? process.cwd()),
    json: values.json === true,
  };
}

function readPackageJson(packageJsonPath) {
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return null;
  }
}

/** packages 直下から、ディレクトリ名または package.json の name で package を探す。 */
function findWorkspacePackage(workspace, packageRef) {
  const packagesDir = path.join(workspace, 'packages');
  const direct = path.join(packagesDir, packageRef, 'package.json');
  if (fs.existsSync(direct)) return readPackageJson(direct);
  if (!fs.existsSync(packagesDir)) return null;

  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJson = readPackageJson(path.join(packagesDir, entry.name, 'package.json'));
    if (packageJson?.name === packageRef) return packageJson;
  }
  return null;
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/** 検証コマンドを機械検査し、認識不能な書式は checked=false で通過させる。 */
function checkVerifyCommand(command, workspace) {
  if (typeof command !== 'string' || command.trim() === '') {
    return { available: false, checked: false, status: 'ng' };
  }

  // `npm run <script> -w <pkg>` に加え、lifecycle 省略形（`npm test -w <pkg>` 等）も解決する。
  // Why not: 省略形を任意の語へ広げない — `npm install -w <pkg>` を script 名と誤読し、
  // scripts に install が無いだけで E3（検証手段なし）へ倒れてしまうため、集合で限定する。
  const npmMatch = /^npm\s+(run\s+)?(\S+)\s+-w\s+(\S+)\s*$/.exec(command.trim());
  if (npmMatch && (npmMatch[1] !== undefined || NPM_LIFECYCLE_SHORTHANDS.has(npmMatch[2]))) {
    const packageJson = findWorkspacePackage(workspace, unquote(npmMatch[3]));
    const available = typeof packageJson?.scripts?.[npmMatch[2]] === 'string';
    return { available, checked: true, status: available ? 'ok' : 'ng' };
  }

  const jestMatch = /^npx\s+jest\s+(.+)$/.exec(command.trim());
  const tscMatch = /^npx\s+tsc\s+(?:--noEmit\s+)?-p\s+(.+)$/.exec(command.trim());
  const target = jestMatch?.[1] ?? tscMatch?.[1];
  if (target !== undefined) {
    const available = fs.existsSync(path.resolve(workspace, unquote(target)));
    return { available, checked: true, status: available ? 'ok' : 'ng' };
  }

  return { available: true, checked: false, status: 'unchecked' };
}

/** E1 → E5 → E3 → E4 → E2 の順で委譲可否を判定する。 */
function decideDelegation(inputs) {
  let exclusion = null;
  let verify = { available: true, checked: false, status: 'unchecked' };

  if (inputs.severity === 'high') {
    exclusion = 'E1';
  } else if (inputs.paths.length === 0) {
    exclusion = 'E5';
  } else {
    verify = checkVerifyCommand(inputs.verify, inputs.workspace);
    if (!verify.available) exclusion = 'E3';
    else if (typeof inputs.interactiveDesign === 'string' && inputs.interactiveDesign.trim() !== '') {
      exclusion = 'E4';
    } else if (inputs.files <= 1 && inputs.lines < 20) {
      exclusion = 'E2';
    }
  }

  return {
    decision: exclusion === null ? 'codex' : 'main',
    exclusion,
    verifyChecked: verify.checked,
    verifyStatus: verify.status,
  };
}

const EXCLUSION_DESCRIPTIONS = {
  E1: '高重大度',
  E2: '小規模変更',
  E3: '検証手段が実行不能',
  E4: '対話的な設計判断あり',
  E5: '対象パス未確定',
};

/** ルート宣言へ貼れる日本語 1 行を組み立てる。 */
function formatLine(result, inputs) {
  const detail = `files=${inputs.files} lines=${inputs.lines} severity=${inputs.severity} verify=${result.verifyStatus}`;
  if (result.decision === 'codex') return `実行手段: codex — 除外なし（${detail}）`;
  return `実行手段: main[${result.exclusion}] — ${EXCLUSION_DESCRIPTIONS[result.exclusion]}（${detail}）`;
}

function evaluate(inputs) {
  const result = decideDelegation(inputs);
  const publicInputs = {
    paths: inputs.paths,
    files: inputs.files,
    lines: inputs.lines,
    severity: inputs.severity,
    verify: inputs.verify,
    interactiveDesign: inputs.interactiveDesign,
  };
  return {
    decision: result.decision,
    exclusion: result.exclusion,
    verifyChecked: result.verifyChecked,
    inputs: publicInputs,
    line: formatLine(result, inputs),
  };
}

function main(argv) {
  try {
    const inputs = parseArgs(argv.slice(2));
    const output = evaluate(inputs);
    console.log(inputs.json ? JSON.stringify(output) : output.line);
    return 0;
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    console.error(`引数エラー: ${error.message}\n${USAGE}`);
    return 2;
  }
}

if (require.main === module) process.exit(main(process.argv));

module.exports = {
  ArgumentError,
  parseArgs,
  findWorkspacePackage,
  checkVerifyCommand,
  decideDelegation,
  formatLine,
  evaluate,
  main,
  USAGE,
};

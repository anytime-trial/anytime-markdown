#!/usr/bin/env node
// anytime-dev-cycle プリフライト（設計書 spec/90.skill/anytime-dev-cycle.ja.md §2.1）。
//
// 実行環境の前提（git/develop・docs リポ・スキル完全性・委譲先 CLI 等）と事前調査
// （未完了プラン・git 概況）を検査し、結果を <workspace>/.anytime/dev-cycle-preflight.json
// へ保存する。マーカーが無い・skillUpdated が SKILL.md 更新日と異なる場合が「初回」で、
// スキルはどの入口モードでも本編前に本スクリプトを実行する。
//
// 使い方（ワークスペースルートで実行）:
//   node .claude/skills/anytime-dev-cycle/preflight.cjs [--json] [--workspace <dir>] [--docs-root <dir>]
//
// docs リポジトリのルートは --docs-root > <workspace>/CLAUDE.md の「- docsRoot: <path>」定義
// の順で解決する（絶対パスを本スクリプトへハードコードしない）。
//
// 終了コード: 0 = 必須すべて pass（任意 NG は縮退として続行可）/ 1 = 必須 NG（サイクル開始不可）

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const MARKER_RELPATH = path.join('.anytime', 'dev-cycle-preflight.json');
const REFERENCE_FILES = [
  'agent-rotation.md',
  'delegation.md',
  'codex-cli.md',
  'stopping-rules-playbook.md',
  'task-criteria.md',
];
const DELEGATION_SCRIPTS = [
  'criteria.cjs',
  'benchmarks.json',
  'ollama-benchmarks.cjs',
  'ollama-delegate.cjs',
  'ollama-probe.cjs',
  'ollama-report.cjs',
  'ollama-verify.cjs',
];

/** CLAUDE.md 本文から「- docsRoot: <path>」定義を取り出す（無ければ null）。 */
function parseDocsRoot(markdown) {
  const m = /^[-*]\s*docsRoot:\s*(\S+)\s*$/m.exec(markdown ?? '');
  return m ? m[1] : null;
}

/** <workspace>/CLAUDE.md から docsRoot 定義を読む（ファイル・定義が無ければ null）。 */
function readWorkspaceDocsRoot(workspaceRoot) {
  const claudeMdPath = path.join(workspaceRoot, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) return null;
  return parseDocsRoot(fs.readFileSync(claudeMdPath, 'utf8'));
}

/** SKILL.md 本文から「更新日: YYYY-MM-DD」を取り出す（無ければ null）。 */
function extractSkillUpdated(markdown) {
  const m = /^更新日:\s*(\d{4}-\d{2}-\d{2})/m.exec(markdown ?? '');
  return m ? m[1] : null;
}

/** マーカーと現行 SKILL.md 更新日からプリフライト再実行の要否を判定する。 */
function needsPreflight(marker, currentSkillUpdated) {
  if (marker === null || marker === undefined) return { required: true, reason: 'first-run' };
  if (typeof marker.skillUpdated !== 'string') return { required: true, reason: 'invalid-marker' };
  if (marker.skillUpdated !== currentSkillUpdated) {
    return { required: true, reason: 'skill-updated' };
  }
  return { required: false, reason: 'cached' };
}

/** チェック結果を必須 NG（中断）と任意 NG（縮退）に分類する。 */
function classifyOutcome(checks) {
  const requiredFailures = checks
    .filter((c) => c.kind === 'required' && !c.passed)
    .map((c) => c.id);
  const degraded = checks.filter((c) => c.kind === 'optional' && !c.passed).map((c) => c.id);
  return { ok: requiredFailures.length === 0, requiredFailures, degraded };
}

/** 未チェックのタスク行（`- [ ]` / `N. [ ]`）を含むプランを列挙する（フェンス内は無視）。 */
function findIncompletePlans(entries) {
  const result = [];
  for (const { file, content } of entries) {
    let inFence = false;
    let incomplete = false;
    for (const line of String(content).split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (!inFence && /^\s*(?:-|\d+\.)\s+\[ \]\s/.test(line)) {
        incomplete = true;
        break;
      }
    }
    if (incomplete) result.push(file);
  }
  return result;
}

function tryExec(cmd, args, options = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
  } catch (err) {
    // 非ゼロ終了(err.status)とコマンド不在(ENOENT)は「期待される否定結果」なので黙って null。
    // それ以外(EACCES・spawn 失敗等)は異常系として 1 行ログを残す(silent catch 禁止)。
    if (err?.status === null || err?.status === undefined) {
      if (err?.code !== 'ENOENT') {
        console.error(
          `[${new Date().toISOString()}] [WARN] preflight tryExec failed: ${cmd} ${args.join(' ')} — ${err?.message ?? err}`,
        );
      }
    }
    return null;
  }
}

/** 副作用のある収集系。checks（必須/任意）と info（事前調査）を返す。 */
function collectChecks({ workspaceRoot, docsRoot, skillDir }) {
  const checks = [];

  const inRepo = tryExec('git', ['-C', workspaceRoot, 'rev-parse', '--is-inside-work-tree']) === 'true';
  const hasDevelop =
    inRepo && tryExec('git', ['-C', workspaceRoot, 'rev-parse', '--verify', '--quiet', 'develop']) !== null;
  checks.push({
    id: 'git-develop',
    kind: 'required',
    passed: hasDevelop,
    detail: inRepo ? (hasDevelop ? 'git リポジトリ・develop ブランチあり' : 'develop ブランチ無し') : 'git リポジトリ外',
  });

  const docsDirs = ['proposal', 'plan', 'spec', 'review'];
  const missingDocs = docsRoot ? docsDirs.filter((d) => !fs.existsSync(path.join(docsRoot, d))) : docsDirs;
  let docsRootDetail;
  if (!docsRoot) {
    docsRootDetail = 'docsRoot 未解決（CLAUDE.md の「- docsRoot: <path>」定義か --docs-root 指定が必要）';
  } else if (missingDocs.length === 0) {
    docsRootDetail = `${docsRoot} 配下 4 dir あり`;
  } else {
    docsRootDetail = `欠落: ${missingDocs.join(', ')}`;
  }
  checks.push({
    id: 'docs-root',
    kind: 'required',
    passed: docsRoot !== null && missingDocs.length === 0,
    detail: docsRootDetail,
  });

  const missingRefs = REFERENCE_FILES.filter(
    (f) => !fs.existsSync(path.join(skillDir, 'references', f)),
  );
  const missingScripts = DELEGATION_SCRIPTS.filter((f) => !fs.existsSync(path.join(skillDir, f)));
  const missing = [...missingRefs.map((f) => `references/${f}`), ...missingScripts];
  checks.push({
    id: 'skill-integrity',
    kind: 'required',
    passed: missing.length === 0,
    detail:
      missing.length === 0
        ? `references ${REFERENCE_FILES.length} 本＋委譲スクリプト ${DELEGATION_SCRIPTS.length} 本あり`
        : `欠落: ${missing.join(', ')}`,
  });

  const codexPath = tryExec(process.platform === 'win32' ? 'where' : 'which', ['codex']);
  checks.push({
    id: 'codex-cli',
    kind: 'optional',
    passed: codexPath !== null,
    detail: codexPath ?? 'PATH に codex なし（Codex 委譲は不可・Claude 実施へ縮退）',
  });

  const ollamaProfile = path.join(workspaceRoot, '.anytime', 'ollama-profile.json');
  checks.push({
    id: 'ollama-profile',
    kind: 'optional',
    passed: fs.existsSync(ollamaProfile),
    detail: fs.existsSync(ollamaProfile)
      ? ollamaProfile
      : 'プロファイル未生成（ollama 委譲前に ollama-probe.cjs --verify が必要）',
  });

  const agentCore = fs.existsSync(path.join(workspaceRoot, 'packages', 'agent-core', 'package.json'));
  checks.push({
    id: 'agent-core',
    kind: 'optional',
    passed: agentCore,
    detail: agentCore
      ? 'packages/agent-core あり（回転ヘルパ利用可）'
      : 'agent-core なし（回転は手動合算・タスク数上限でフォールバック）',
  });

  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const statusFiles = fs.existsSync(vscodeDir)
    ? fs.readdirSync(vscodeDir).filter((f) => /^claude-code-status-.*\.json$/.test(f))
    : null;
  checks.push({
    id: 'session-status',
    kind: 'optional',
    passed: statusFiles !== null,
    detail:
      statusFiles === null
        ? '.vscode なし（並行セッション検知は手動確認）'
        : `status ファイル ${statusFiles.length} 件`,
  });

  const planDir = docsRoot ? path.join(docsRoot, 'plan') : null;
  const PLAN_LIST_CAP = 20;
  let incompletePlans = [];
  let incompletePlanTotal = 0;
  if (planDir !== null && fs.existsSync(planDir)) {
    const entries = fs
      .readdirSync(planDir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('index.'))
      .map((f) => ({
        file: f,
        content: fs.readFileSync(path.join(planDir, f), 'utf8'),
        mtime: fs.statSync(path.join(planDir, f)).mtimeMs,
      }));
    const byRecency = new Map(entries.map((e) => [e.file, e.mtime]));
    const all = findIncompletePlans(entries).sort(
      (a, b) => (byRecency.get(b) ?? 0) - (byRecency.get(a) ?? 0),
    );
    incompletePlanTotal = all.length;
    incompletePlans = all.slice(0, PLAN_LIST_CAP);
  }

  const info = {
    branch: inRepo ? tryExec('git', ['-C', workspaceRoot, 'branch', '--show-current']) : null,
    dirtyFiles: inRepo
      ? (tryExec('git', ['-C', workspaceRoot, 'status', '--porcelain']) || '')
          .split('\n')
          .filter(Boolean).length
      : null,
    incompletePlans,
    incompletePlanTotal,
  };

  return { checks, info };
}

function runPreflight({ workspaceRoot, docsRoot }) {
  const skillDir = __dirname;
  const skillMd = fs.existsSync(path.join(skillDir, 'SKILL.md'))
    ? fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8')
    : '';
  const skillUpdated = extractSkillUpdated(skillMd);
  const { checks, info } = collectChecks({ workspaceRoot, docsRoot, skillDir });
  const outcome = classifyOutcome(checks);
  const marker = {
    checkedAt: new Date().toISOString(),
    skillUpdated,
    ok: outcome.ok,
    requiredFailures: outcome.requiredFailures,
    degraded: outcome.degraded,
    checks,
    info,
  };
  const markerPath = path.join(workspaceRoot, MARKER_RELPATH);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  return { marker, markerPath };
}

function main(argv) {
  const args = argv.slice(2);
  const readOpt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const workspaceRoot = path.resolve(readOpt('--workspace', process.cwd()));
  const docsRoot = readOpt('--docs-root', null) ?? readWorkspaceDocsRoot(workspaceRoot);
  const asJson = args.includes('--json');

  const { marker, markerPath } = runPreflight({ workspaceRoot, docsRoot });
  if (asJson) {
    console.log(JSON.stringify(marker, null, 2));
  } else {
    console.log(`[dev-cycle preflight] ${marker.ok ? 'OK' : 'NG（必須チェック失敗）'}`);
    for (const c of marker.checks) {
      const mark = c.passed ? 'ok' : c.kind === 'required' ? 'NG(必須)' : '縮退(任意)';
      console.log(`  - ${c.id}: ${mark} — ${c.detail}`);
    }
    const planHead = marker.info.incompletePlans.slice(0, 5);
    console.log(
      `  - 事前調査: branch=${marker.info.branch ?? '-'} / 未コミット ${marker.info.dirtyFiles ?? '-'} 件 / 未完了プラン ${marker.info.incompletePlanTotal} 件${
        planHead.length > 0
          ? `（新しい順: ${planHead.join(', ')}${marker.info.incompletePlanTotal > planHead.length ? ' ほか' : ''}）`
          : ''
      }`,
    );
    console.log(`  マーカー: ${markerPath}`);
  }
  return marker.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = {
  parseDocsRoot,
  readWorkspaceDocsRoot,
  extractSkillUpdated,
  needsPreflight,
  classifyOutcome,
  findIncompletePlans,
  collectChecks,
  runPreflight,
  MARKER_RELPATH,
};

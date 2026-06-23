#!/usr/bin/env node
/**
 * anytime-cross-review: Codex code review の headless 起動ラッパ。
 * 純ロジックは export し node:test でテスト。副作用(codex spawn / git status)は
 * 依存注入で分離する。bwrap 不可環境のため codex は --dangerously-bypass-approvals-and-sandbox。
 */
'use strict';

const START = '<<<CROSS-REVIEW-START>>>';
const END = '<<<CROSS-REVIEW-END>>>';

/** Codex に渡すレビュー指示。review-finding-format を強制し read-only を明示する。 */
function buildReviewPrompt() {
  return [
    'あなたはコードレビュアーです。与えられた diff をレビューし、指摘を以下の形式で厳密に出力してください。',
    '',
    '出力は必ず ' + START + ' と ' + END + ' で挟むこと。両マーカーの外には何も書かない。',
    '各指摘は次の review-finding-format に従う:',
    '',
    '### N. タイトル',
    '- 重大度: error | warn | info',
    '- カテゴリ: bug | logic | spec | security | performance | maintainability | other',
    '- 対象: <file_path:line>',
    '',
    '問題: <何が問題か>',
    '提案: <どう直すか>',
    '',
    '制約: これはレビューのみ。ファイルを変更しない・コミットしない(read-only)。',
    '指摘が無ければ ' + START + ' の直後に「指摘なし」とだけ書く。',
  ].join('\n');
}

/** codex stdout からセンチネル間のレビュー本文を取り出す。不在なら null。 */
function extractReviewSection(stdout) {
  const s = String(stdout);
  const i = s.indexOf(START);
  const j = s.indexOf(END);
  if (i === -1 || j === -1 || j <= i) return null;
  return s.slice(i + START.length, j).trim();
}

/** review-finding-format のセクションから {index, severity} 配列を抽出する。 */
function parseFindings(section) {
  const text = String(section);
  const lines = text.split('\n');
  const findings = [];
  let current = null;
  for (const line of lines) {
    const head = /^###\s+(\d+)\./.exec(line);
    if (head) {
      if (current) findings.push(current);
      current = { index: Number(head[1]), severity: 'info' };
      continue;
    }
    if (current) {
      const sev = /^[-*]?\s*(?:\*\*)?重大度(?:\*\*)?\s*[：:]\s*(error|warn|warning|info|エラー|警告|軽微)/i.exec(line);
      if (sev) {
        const v = sev[1].toLowerCase();
        current.severity = /error|エラー/.test(v) ? 'error' : /warn|警告/.test(v) ? 'warn' : 'info';
      }
    }
  }
  if (current) findings.push(current);
  return findings;
}

/** 指摘群の最大重大度（error > warn > info）。空なら info。 */
function maxSeverity(findings) {
  let r = 'info';
  for (const f of findings) {
    if (f.severity === 'error') return 'error';
    if (f.severity === 'warn') r = 'warn';
  }
  return r;
}

/** git status --porcelain の before/after を比較し codex による新規変更を検出する。 */
function detectMutation(beforePorcelain, afterPorcelain) {
  const toSet = (t) => new Set(String(t).split('\n').map((l) => l.trimEnd()).filter(Boolean));
  const before = toSet(beforePorcelain);
  const after = toSet(afterPorcelain);
  const added = [...after].filter((l) => !before.has(l));
  return { mutated: added.length > 0, added };
}

/**
 * Codex レビューのオーケストレータ。副作用(codex 実行・git status)は注入する。
 */
async function runReview(o) {
  const { base, runCodex, gitStatus, logger } = o;
  const before = gitStatus();
  let res;
  try {
    res = await runCodex({ base, prompt: buildReviewPrompt() });
  } catch (e) {
    logger.error(`[cross-review] codex 起動失敗: ${e && e.message}`);
    return { ok: false, error: `codex spawn failed: ${e && e.message}`, mutated: false, findingCount: 0, maxSeverity: 'info', section: null };
  }
  const after = gitStatus();
  const mut = detectMutation(before, after);
  if (mut.mutated) {
    logger.error(`[cross-review] codex がファイルを変更しました(read-only 逸脱): ${mut.added.join(', ')}`);
    return { ok: false, error: `workspace mutated: ${mut.added.join(', ')}`, mutated: true, added: mut.added, findingCount: 0, maxSeverity: 'info', section: null };
  }
  if (res.code !== 0) {
    logger.error(`[cross-review] codex exit ${res.code}: ${res.stderr}`);
    return { ok: false, error: `codex exit ${res.code}: ${res.stderr || ''}`.trim(), mutated: false, findingCount: 0, maxSeverity: 'info', section: null };
  }
  const section = extractReviewSection(res.stdout);
  if (section === null) {
    logger.error('[cross-review] codex 出力にセンチネルが見つかりません');
    return { ok: false, error: 'no review section (sentinels missing)', mutated: false, findingCount: 0, maxSeverity: 'info', section: null };
  }
  const findings = parseFindings(section);
  return { ok: true, error: null, mutated: false, findingCount: findings.length, maxSeverity: maxSeverity(findings), section };
}

module.exports = { buildReviewPrompt, extractReviewSection, parseFindings, maxSeverity, detectMutation, runReview, START, END };

if (require.main === module) {
  const { spawnSync } = require('node:child_process');
  const args = process.argv.slice(2);
  const baseIdx = args.indexOf('--base');
  const base = baseIdx !== -1 ? args[baseIdx + 1] : 'develop';
  const cwdIdx = args.indexOf('--cwd');
  const cwd = cwdIdx !== -1 ? args[cwdIdx + 1] : process.cwd();
  const logger = {
    info: (m) => process.stderr.write(`[${new Date().toISOString()}] [INFO] ${m}\n`),
    error: (m) => process.stderr.write(`[${new Date().toISOString()}] [ERROR] ${m}\n`),
  };
  const gitStatus = () => {
    const r = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
    return r.stdout || '';
  };
  const runCodex = ({ base, prompt }) => {
    const r = spawnSync('codex', ['exec', 'review', '--base', base, '--dangerously-bypass-approvals-and-sandbox', '-'], { cwd, input: prompt, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    return { code: r.status == null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  runReview({ base, runCodex, gitStatus, logger }).then((out) => {
    if (!out.ok) {
      logger.error(out.error || 'unknown error');
      process.exit(out.mutated ? 3 : 2);
    }
    process.stdout.write(out.section + '\n');
    logger.info(`findings=${out.findingCount} maxSeverity=${out.maxSeverity}`);
    process.exit(0);
  });
}

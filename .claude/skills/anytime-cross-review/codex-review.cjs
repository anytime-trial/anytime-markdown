#!/usr/bin/env node
/**
 * anytime-cross-review: Codex code review の headless 起動ラッパ。
 * 純ロジックは export し node:test でテスト。副作用(codex spawn / git status)は
 * 依存注入で分離する。bwrap 不可環境のため codex は --dangerously-bypass-approvals-and-sandbox。
 */
'use strict';

const START = '<<<CROSS-REVIEW-START>>>';
const END = '<<<CROSS-REVIEW-END>>>';

/**
 * Codex に渡すレビュー指示。review-finding-format を強制し read-only を明示する。
 * `codex exec review --base` は [PROMPT] と併用不可のため、`codex exec`(汎用)に
 * diff の取得方法を指示する形にする(プロンプト全制御のため)。
 */
function buildReviewPrompt(base) {
  const b = base || 'develop';
  return [
    'あなたはコードレビュアーです。現在の作業ブランチが ' + b + ' に対して加えた変更をレビューしてください。',
    '変更は `git diff ' + b + '...HEAD` で取得すること（必要なら個別ファイルも git で読む）。',
    '指摘を以下の形式で厳密に出力してください。',
    '',
    '出力は必ず ' + START + ' と ' + END + ' で挟むこと。両マーカーの外には何も書かない。',
    '各指摘は次の review-finding-format に従う（マーカーの bold ** は必須。ingest パーサが要求する）:',
    '',
    '### N. タイトル',
    '- **重大度**: error | warn | info',
    '- **カテゴリ**: logic | spec | security | perf | naming | a11y | design | other',
    '- **対象**: <file_path:line>',
    '',
    '**問題:** <何が問題か>',
    '**提案:** <どう直すか>',
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

/**
 * codex 実行前後の worktree fingerprint を比較し変更を検出する。
 * fingerprint は `git status --porcelain` + `git diff HEAD`(追跡ファイルの内容)を含むため、
 * 実行前から dirty だったファイルへの上書きも(内容差で)検出できる。
 * mutated は文字列一致で判定。added は porcelain 行集合の新規分(best-effort・参考用)。
 */
function detectMutation(beforeFingerprint, afterFingerprint) {
  const before = String(beforeFingerprint);
  const after = String(afterFingerprint);
  if (before === after) return { mutated: false, added: [] };
  const toSet = (t) => new Set(t.split('\n').map((l) => l.trimEnd()).filter(Boolean));
  const beforeSet = toSet(before);
  const added = [...toSet(after)].filter((l) => !beforeSet.has(l));
  return { mutated: true, added };
}

/**
 * Codex 実行のオーケストレータ。副作用(codex 実行・git status)は注入する。
 * o.prompt を渡せば任意プロンプト(相互検証 Round 2 等)も同じ read-only ガード下で実行する。
 * 省略時は buildReviewPrompt(base)。
 */
async function runReview(o) {
  const { base, runCodex, gitStatus, logger } = o;
  const prompt = o.prompt || buildReviewPrompt(base);
  const before = gitStatus();
  let res;
  try {
    res = await runCodex({ base, prompt });
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
  // --verify: Round 2 の相互検証。stdin のプロンプトを同じ read-only ガード下で codex 実行する。
  const verify = args.includes('--verify');
  const customPrompt = verify ? require('node:fs').readFileSync(0, 'utf8') : undefined;
  const logger = {
    info: (m) => process.stderr.write(`[${new Date().toISOString()}] [INFO] ${m}\n`),
    error: (m) => process.stderr.write(`[${new Date().toISOString()}] [ERROR] ${m}\n`),
  };
  const CODEX_TIMEOUT_MS = Number(process.env.CROSS_REVIEW_TIMEOUT_MS) || 5 * 60 * 1000;
  // worktree fingerprint: file レベル変化(porcelain・新規/未追跡含む) + 追跡ファイルの内容差(git diff HEAD)。
  // 後者により実行前から dirty だったファイルへの上書きも検出できる(指摘#1)。
  const gitStatus = () => {
    const st = spawnSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' });
    const df = spawnSync('git', ['diff', 'HEAD'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    return (st.stdout || '') + '\n--- git diff HEAD ---\n' + (df.stdout || '');
  };
  const runCodex = ({ prompt }) => {
    // `codex exec review --base` は [PROMPT] と併用不可のため汎用 `codex exec` を使い、
    // diff の取得方法はプロンプト側で指示する。bwrap 不可環境ゆえ bypass。timeout で degrade 可能に(指摘#3)。
    const r = spawnSync('codex', ['exec', '--dangerously-bypass-approvals-and-sandbox', '-'], {
      cwd, input: prompt, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: CODEX_TIMEOUT_MS,
    });
    if (r.error) {
      const reason = r.error.code === 'ETIMEDOUT' ? `timeout ${CODEX_TIMEOUT_MS}ms` : r.error.message;
      return { code: 1, stdout: r.stdout || '', stderr: `codex spawn error: ${reason}` };
    }
    return { code: r.status == null ? 1 : r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  runReview({ base, prompt: customPrompt, runCodex, gitStatus, logger }).then((out) => {
    if (!out.ok) {
      logger.error(out.error || 'unknown error');
      process.exit(out.mutated ? 3 : 2);
    }
    process.stdout.write(out.section + '\n');
    logger.info(`findings=${out.findingCount} maxSeverity=${out.maxSeverity}`);
    process.exit(0);
  });
}

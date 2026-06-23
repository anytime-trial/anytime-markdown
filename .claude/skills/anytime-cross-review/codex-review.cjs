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

module.exports = { buildReviewPrompt, extractReviewSection, parseFindings, maxSeverity, START, END };

if (require.main === module) {
  // CLI: Task 6 で実装
}

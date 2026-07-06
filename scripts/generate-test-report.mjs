#!/usr/bin/env node
/**
 * generate-test-report — verification.db の台帳から提出用テスト結果書（Markdown）を生成する。
 *
 * 使い方:
 *   node scripts/generate-test-report.mjs --commit <hash> [--label "<対象名>"] [--out <path>]
 *   node scripts/generate-test-report.mjs --since <ISO> [--until <ISO>] [--label "<対象名>"] [--out <path>]
 *
 * --out 省略時は stdout。結果書は台帳の派生スナップショットであり手修正しない（再実行 → 再生成）。
 */
import * as fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { VERIFICATION_KINDS, listRuns, openVerificationDb, resolveVerificationDbPath } from './verification-db.mjs';

const TIME_ZONE = 'Asia/Tokyo';

/** UTC ISO 文字列を JST 表示（YYYY-MM-DD HH:mm JST）へ変換する。表示専用。 */
function formatJst(iso) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
  return `${parts} JST`;
}

/** 台帳 rows からテスト結果書 Markdown を組み立てる（純関数）。 */
export function buildReportMarkdown({ runs, targetLabel, generatedAtIso }) {
  const dateOnly = generatedAtIso.slice(0, 10);
  const byKind = new Map(VERIFICATION_KINDS.map((k) => [k, []]));
  for (const run of runs) byKind.get(run.kind)?.push(run);

  const summaryRows = VERIFICATION_KINDS.map((k) => {
    const list = byKind.get(k);
    const pass = list.filter((r) => r.status === 'pass').length;
    const fail = list.filter((r) => r.status !== 'pass').length;
    const totalMs = list.reduce((a, r) => a + r.duration_ms, 0);
    return `| ${k} | ${list.length} | ${pass} | ${fail} | ${(totalMs / 1000).toFixed(1)}s |`;
  });

  const detailLines = runs.map(
    (r) =>
      `| ${formatJst(r.started_at)} | ${r.kind} | ${r.package} | ${r.status} | ${(r.duration_ms / 1000).toFixed(1)}s | \`${r.command}\` |`,
  );

  const failures = runs.filter((r) => r.status !== 'pass');
  const failureLines = failures.map((f) => {
    const recovered = runs.some(
      (r) => r.package === f.package && r.kind === f.kind && r.status === 'pass' && r.started_at > f.started_at,
    );
    return `- ${formatJst(f.started_at)} ${f.package}/${f.kind} **${f.status}** — ${recovered ? '対処済み（後続 run で pass）' : '未対処'}`;
  });

  const missing = VERIFICATION_KINDS.filter((k) => !byKind.get(k).some((r) => r.status === 'pass'));

  const environments = [...new Set(runs.map((r) => r.environment).filter(Boolean))];
  const commits = [...new Set(runs.map((r) => r.commit_hash))];

  return `---
title: "テスト結果書: ${targetLabel}"
date: "${dateOnly}"
type: "report"
lang: "ja"
author: "generate-test-report.mjs"
category: "test-report"
excerpt: "verification.db の検証実施台帳から自動生成したテスト結果書（対象: ${targetLabel}、run 数 ${runs.length}）。"
---

# テスト結果書: ${targetLabel}

生成日時: ${formatJst(generatedAtIso)}（台帳からの自動生成。手修正せず再実行 → 再生成すること）

## 対象と環境

- 対象コミット: ${commits.length > 0 ? commits.map((c) => `\`${c.slice(0, 12)}\``).join(', ') : 'なし'}
- 実行環境: ${environments.length > 0 ? environments.map((e) => `\`${e}\``).join(', ') : '記録なし'}

## サマリ

| 種別 | 実行数 | pass | fail/error | 総所要時間 |
| --- | --- | --- | --- | --- |
${summaryRows.join('\n')}

## 種別別の結果

| 実施日時 | 種別 | パッケージ | 結果 | 所要 | コマンド |
| --- | --- | --- | --- | --- | --- |
${detailLines.length > 0 ? detailLines.join('\n') : '| - | - | - | - | - | 記録なし |'}

## 失敗と対処

${failureLines.length > 0 ? failureLines.join('\n') : '- 失敗なし'}

## 検証欠落

対象範囲で pass 記録が無い種別（提出前の残作業一覧を兼ねる。affected 解決導入前のため全種別を母集団とする）:

${missing.length > 0 ? missing.map((k) => `- ${k}`).join('\n') : '- なし（全種別に pass 記録あり）'}
`;
}

function parseCliArgs(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const commitHash = get('--commit');
  const sinceIso = get('--since');
  const untilIso = get('--until');
  if (!commitHash && !sinceIso) {
    throw new Error('usage: generate-test-report.mjs (--commit <hash> | --since <ISO> [--until <ISO>]) [--label <l>] [--out <path>]');
  }
  return { commitHash, sinceIso, untilIso, label: get('--label'), out: get('--out') };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const db = openVerificationDb(resolveVerificationDbPath());
    let runs;
    try {
      runs = listRuns(db, args);
    } finally {
      db.close();
    }
    const label = args.label ?? (args.commitHash ? `commit ${args.commitHash.slice(0, 12)}` : `${args.sinceIso} 以降`);
    const md = buildReportMarkdown({ runs, targetLabel: label, generatedAtIso: new Date().toISOString() });
    if (args.out) {
      fs.writeFileSync(args.out, md);
      console.log(`[${new Date().toISOString()}] [INFO] generate-test-report: wrote ${args.out} (${runs.length} runs)`);
    } else {
      console.log(md);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] [ERROR] generate-test-report: ${err.stack ?? err}`);
    process.exit(2);
  }
}

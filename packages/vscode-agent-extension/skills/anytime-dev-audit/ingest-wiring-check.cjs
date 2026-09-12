#!/usr/bin/env node
// anytime-dev-audit — 外部ツール設定・ingest 配線の診断 CLI（設計書 spec/90.skill/anytime-dev-audit.ja.md §3.3）。
//
// Trail / markdown 拡張の設定（anytimeTrail.workspace.path・anytimeMarkdown.docsRoot）と
// lep.json（sources.gitRoots / stage / llm.providers.*.baseUrl）を読み、設定値の妥当性だけでなく
// 「取り込まれた実データの鮮度」まで見て D1〜D7 を判定する。
//
// Why not 台帳の status を根拠にしない: 2026-09-12 の anytime-travel 実測では、監視対象が空配列で
// コミット取込が 11 日間停止している間も caravan_pipeline_runs の CommitResolver は 786 回すべて
// success を返していた。取込ゼロは正常系として記録されるため、成功回数は故障の否定にならない。
//
// 構成: 本ファイル = CLI と合成 / ingest-wiring-judge.cjs = 判定（純関数）/
//       ingest-wiring-collect.cjs = 事実収集（I/O）/ ingest-wiring-settings.cjs = VS Code 設定。
//
// 使い方（ワークスペースルートで実行）:
//   node .claude/skills/anytime-dev-audit/ingest-wiring-check.cjs [--json] [--workspace <dir>]
//                                                                [--now <ISO8601>] [--no-network]
//
// 終了コード: 0 = error 判定なし（warn / 測定不能 / 対象外は 0）/ 1 = error 判定あり /
//             2 = 診断そのものが中断した（判定結果ではない。1 と混同しないこと）

const path = require('node:path');
const os = require('node:os');

const { judge, summarize } = require('./ingest-wiring-judge.cjs');
const { collectFacts } = require('./ingest-wiring-collect.cjs');

const STATUS_LABEL = { fired: null, ok: 'ok', unmeasurable: '測定不能', 'not-applicable': '対象外' };

function formatText(report) {
  const lines = [`[dev-audit ingest 配線診断] workspace=${report.facts.workspaceRoot}`];
  for (const f of report.findings) {
    const label = f.status === 'fired' ? f.severity.toUpperCase() : STATUS_LABEL[f.status];
    lines.push(`  - ${f.id} ${f.title}: ${label} — ${f.detail}`);
  }
  const s = report.summary;
  lines.push(
    `  判定: error ${s.error} 件 / warn ${s.warn} 件 / 測定不能 ${s.unmeasurable} 件 / 対象外 ${s.notApplicable} 件`,
  );
  return lines.join('\n');
}

async function runIngestWiringCheck({ workspaceRoot, now, network, home }) {
  const facts = await collectFacts({ workspaceRoot, now, network, home });
  const findings = judge(facts);
  return { checkedAt: now, facts, findings, summary: summarize(findings) };
}

async function main(argv) {
  const args = argv.slice(2);
  const readOpt = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const now = readOpt('--now', new Date().toISOString());
  if (Number.isNaN(Date.parse(now))) {
    throw new Error(`--now に解釈できない日時が渡された: ${JSON.stringify(now)}`);
  }
  const report = await runIngestWiringCheck({
    workspaceRoot: path.resolve(readOpt('--workspace', process.cwd())),
    now,
    network: !args.includes('--no-network'),
    home: os.homedir(),
  });
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatText(report));
  return report.summary.error > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv)
    .then((code) => process.exit(code))
    .catch((err) => {
      // 中断を 1（= error 判定あり）で返すと、呼び出し側が「配線が壊れている」と読み違える。
      console.error(`[${new Date().toISOString()}] [ERROR] ingest-wiring-check 中断: ${err?.stack ?? err}`);
      process.exit(2);
    });
}

module.exports = { formatText, runIngestWiringCheck, main };

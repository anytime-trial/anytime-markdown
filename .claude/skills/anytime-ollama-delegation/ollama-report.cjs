#!/usr/bin/env node
// ollama-report.cjs — プロファイルを markdown レポートへ整形する。
//
// レポートは「今このマシンで ollama に何を委譲してよいか」の記録であり、
// モデルを入れ替えたときの前回比デルタ（昇格/降格）を残すことに主眼がある。
// 出力先の規約は AGENTS.md（/Shared/anytime-markdown-docs/report/）に従う。

const VERDICT_MARK = { allow: '✅ allow', conditional: '⚠️ conditional', deny: '❌ deny' };

/** 前回プロファイルと比較し、委譲可否の昇格・降格を検出する。 */
function diffEligibility(before, after) {
  if (!before) return { promoted: [], demoted: [], isFirstRun: true };

  const rank = { deny: 0, conditional: 1, allow: 2 };
  const beforeMap = new Map(before.map((e) => [e.taskId, e.verdict]));

  const promoted = [];
  const demoted = [];
  for (const entry of after) {
    const prev = beforeMap.get(entry.taskId);
    if (prev === undefined || prev === entry.verdict) continue;

    const change = { taskId: entry.taskId, from: prev, to: entry.verdict };
    if (rank[entry.verdict] > rank[prev]) promoted.push(change);
    else demoted.push(change);
  }

  return { promoted, demoted, isFirstRun: false };
}

function renderVerifyTable(model) {
  const entries = Object.entries(model.verify ?? {});
  if (entries.length === 0) return '実証テスト未実行。\n';

  const rows = entries
    .map(([id, r]) => `| \`${id}\` | ${r.passed ? 'PASS' : '**FAIL**'} | ${r.detail ?? ''} |`)
    .join('\n');
  return `| テスト | 結果 | 詳細 |\n| --- | --- | --- |\n${rows}\n`;
}

function renderEligibilityTable(model) {
  const rows = (model.eligibility ?? [])
    .map((e) => `| ${e.label ?? e.taskId} | ${VERDICT_MARK[e.verdict] ?? e.verdict} | ${e.reason} |`)
    .join('\n');
  return `| タスク | 判定 | 理由 |\n| --- | --- | --- |\n${rows}\n`;
}

function renderBenchmarks(model) {
  const entries = Object.entries(model.benchmarks ?? {});
  if (entries.length === 0) {
    return 'ベンチ値未取得。Web から公開スコアを取得してプロファイルへ書き戻すと、判定の精度が上がる（`references/task-criteria.md` の「ベンチ情報源」を参照）。\n';
  }
  return `公称ベンチ: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
}

function summarize(profile) {
  const counts = { allow: 0, conditional: 0, deny: 0 };
  for (const model of profile.models ?? []) {
    for (const e of model.eligibility ?? []) {
      counts[e.verdict] = (counts[e.verdict] ?? 0) + 1;
    }
  }
  return counts;
}

/** プロファイル（+ 任意の前回プロファイル）から markdown レポートを生成する。 */
function renderReport(profile, previous = null) {
  const date = profile.generatedAt.slice(0, 10);
  const counts = summarize(profile);
  const modelNames = (profile.models ?? []).map((m) => m.name).join(', ');

  const vramLine =
    profile.usableVramGb === null
      ? '実効 VRAM: 未測定（`--vram` または `--verify` で実測する）'
      : `実効 VRAM: **${profile.usableVramGb}GB**（GPU の総量ではなく、**実行時に ollama が確保できた空き容量**。` +
        `${profile.vramBounded ? 'CPU へ溢れる境界まで到達して確定' : '上限には未到達のため下限値'}）`;

  const lines = [];
  lines.push('---');
  lines.push(`title: "ollama 委譲可否レポート ${date}"`);
  lines.push(`date: "${date}"`);
  lines.push('type: "report"');
  lines.push('lang: "ja"');
  lines.push('author: "anytime-ollama-delegation (ollama-probe.cjs)"');
  lines.push('category: "ollama / タスク委譲"');
  lines.push(
    `excerpt: "導入モデル ${modelNames} の委譲可否を実測で判定。allow ${counts.allow} / conditional ${counts.conditional} / deny ${counts.deny}。実効 VRAM ${profile.usableVramGb ?? '未測定'}GB。"`,
  );
  lines.push('---');
  lines.push('');
  lines.push(`# ollama 委譲可否レポート ${date}`);
  lines.push('');

  if (!profile.verified) {
    lines.push('> **未検証プロファイルです。** 実証テストを実行していないため、以下の判定は暫定です。');
    lines.push('> `node ollama-probe.cjs --verify` を実行してください。');
    lines.push('');
  }

  lines.push('## 環境');
  lines.push('');
  lines.push(`- エンドポイント: \`${profile.endpoint}\``);
  lines.push(`- ${vramLine}`);
  lines.push(`- 導入モデル: ${profile.models?.length ?? 0} 件`);
  lines.push('');

  const prevEligibility = previous?.models?.flatMap((m) => m.eligibility ?? []) ?? null;
  const currEligibility = (profile.models ?? []).flatMap((m) => m.eligibility ?? []);
  const diff = diffEligibility(prevEligibility, currEligibility);

  if (!diff.isFirstRun && (diff.promoted.length > 0 || diff.demoted.length > 0)) {
    lines.push('## 前回比デルタ');
    lines.push('');
    for (const p of diff.promoted) {
      lines.push(`- 昇格: \`${p.taskId}\` ${p.from} → **${p.to}**`);
    }
    for (const d of diff.demoted) {
      lines.push(`- 降格: \`${d.taskId}\` ${d.from} → **${d.to}**`);
    }
    lines.push('');
  }

  for (const model of profile.models ?? []) {
    lines.push(`## ${model.name}`);
    lines.push('');
    lines.push(
      `${model.parameterSize ?? '?'} / ${model.quantization ?? '?'} / capabilities: ${(model.capabilities ?? []).join(', ')}`,
    );
    lines.push('');
    if (model.declaredCtx) {
      const usable = model.maxUsableCtx
        ? `100% GPU を維持できる実測上限: **${model.maxUsableCtx}**`
        : '実測上限は未測定';
      lines.push(`公称コンテキスト長: ${model.declaredCtx} / ${usable}`);
      lines.push('');
    }
    lines.push(renderBenchmarks(model));
    lines.push('### 実証テスト');
    lines.push('');
    lines.push(renderVerifyTable(model));
    lines.push('### 委譲可否');
    lines.push('');
    lines.push(renderEligibilityTable(model));
  }

  lines.push('## 注意');
  lines.push('');
  lines.push('- 判定は**実測（実証テスト）優先**。公称ベンチは実測を覆さない。');
  lines.push('- `conditional` は「テストの数サンプルは通ったが本番入力で崩れうる」意味。出力を検証できる場合のみ委譲する。');
  lines.push('- 実効 VRAM は他アプリの GPU 使用状況で変動する。ブラウザを開いただけで載るモデルが変わりうる。');
  lines.push('- モデルを入れ替えたら `node ollama-probe.cjs --verify` を再実行し、本レポートを再生成する。');
  lines.push('');

  return lines.join('\n');
}

module.exports = { renderReport, diffEligibility };

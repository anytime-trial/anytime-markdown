#!/usr/bin/env node
// anytime-dev-audit — ingest 配線診断の判定（D1〜D7）。
//
// I/O を一切持たない純関数だけを置く。事実の収集は ingest-wiring-collect.cjs、
// CLI は ingest-wiring-check.cjs が担う。判定をここへ閉じ込めるのは、閾値と発火条件を
// ユニットテストで固定するため（散文手順にするとモデルごとに所見がぶれる）。

const path = require('node:path');

/** D2: 実データの鮮度がこの時間を超えて遅れていたら error。 */
const STALE_HOURS = 24;
/** D3: 同一 scope がこの回数連続で skipped なら warn。 */
const SKIP_STREAK = 50;
/** D5: lep.json の stage 許容集合（大文字小文字を区別する）。 */
const VALID_STAGES = ['disabled', 'sources', 'primary', 'memory', 'primary+memory', 'all'];

const SETTING_WORKSPACE_PATH = 'anytimeTrail.workspace.path';
const SETTING_LEP_CONFIG_PATH = 'anytimeTrail.lep.configPath';
const SETTING_DOCS_ROOT = 'anytimeMarkdown.docsRoot';

const finding = (id, title, severity, status, detail, evidence = {}) => ({
  id,
  title,
  severity,
  status,
  detail,
  evidence,
});

function hoursBetween(laterIso, earlierIso) {
  const later = Date.parse(laterIso);
  const earlier = Date.parse(earlierIso);
  if (Number.isNaN(later) || Number.isNaN(earlier)) return null;
  return (later - earlier) / 3_600_000;
}

const outOfScope = (facts, id, title, severity) =>
  finding(id, title, severity, 'not-applicable', `対象外: ${facts.dbDir.path} が無い（Trail 未導入）`);

/**
 * D1: 監視リポジトリの解決結果。
 *
 * 実在しないパスと「実在するが git working tree でない」パスを同じ扱いにするのは、本番の
 * resolveWatchedRepos が両方を同じ continue で捨てるため（どちらもコミットは永久に取り込まれない）。
 * 自ワークスペースが有効な監視対象に入らない場合も発火させる — 監視対象が非空でも、
 * 当該リポジトリの取込がゼロであることはその時点で確定するため。
 *
 * ただし git 判定が不能だったもの（実行ファイル不在・アクセス拒否）は「working tree でない」と
 * 断定しない。診断ツール自身の実行環境の欠落を、ユーザーの設定の error として報告しないため。
 */
function judgeD1(facts, trailAbsent) {
  const title = '監視リポジトリの解決結果';
  if (trailAbsent) return outOfScope(facts, 'D1', title, 'error');

  const isUnknown = (w) => typeof w.isGitWorkTree === 'object' && w.isGitWorkTree !== null;
  const missing = facts.watched.filter((w) => !w.exists);
  const unknown = facts.watched.filter((w) => w.exists && isUnknown(w));
  const notGit = facts.watched.filter((w) => w.exists && w.isGitWorkTree === false);
  const effective = facts.watched.filter((w) => w.exists && w.isGitWorkTree === true);

  if (unknown.length > 0) {
    return finding(
      'D1',
      title,
      'error',
      'unmeasurable',
      `測定不能: git working tree か判定できないパスがある — ${unknown
        .map((w) => `${w.path}（${w.isGitWorkTree.unknown}）`)
        .join(' / ')}`,
      { watched: facts.watched, unknown: unknown.map((w) => w.path) },
    );
  }

  // symlink 越しに同じディレクトリを指している場合があるため、実パスで突き合わせる。
  const workspaceWatched = effective.some((w) => (w.realPath ?? w.path) === (facts.workspaceRealPath ?? facts.workspaceRoot));

  const parts = [`解決結果 ${facts.watched.length} 件（有効 ${effective.length} 件）`];
  if (effective.length === 0) parts.push('有効な監視対象が 0 件（コミット取込は行われない）');
  if (missing.length > 0) parts.push(`実在しない: ${missing.map((w) => w.path).join(', ')}`);
  if (notGit.length > 0) {
    parts.push(`git working tree でない（本番も同じく捨てる）: ${notGit.map((w) => w.path).join(', ')}`);
  }
  if (!workspaceWatched) {
    parts.push(`本ワークスペース（${facts.workspaceRoot}）自身が監視対象に無く、そのコミットは取り込まれない`);
  }

  const fired = effective.length === 0 || missing.length > 0 || notGit.length > 0 || !workspaceWatched;
  return finding('D1', title, 'error', fired ? 'fired' : 'ok', parts.join(' / '), {
    watched: facts.watched,
    effective: effective.map((w) => w.path),
    workspaceWatched,
    overriddenBySetting: facts.watchedOverriddenBySetting,
  });
}

/** D2: コミット取込の鮮度。台帳の status ではなく取り込まれた実データで測る。 */
function judgeD2(facts, trailAbsent) {
  const title = 'コミット取込の鮮度';
  if (trailAbsent) return outOfScope(facts, 'D2', title, 'error');
  if (facts.ingest.status !== 'ok') {
    return finding('D2', title, 'error', 'unmeasurable', `測定不能: ${facts.ingest.reason}`);
  }
  if (facts.git.headCommittedAt === null) {
    return finding('D2', title, 'error', 'unmeasurable', '測定不能: git の最新コミットを取得できない');
  }

  const last = facts.ingest.lastCommittedAt;
  const lagHours = last === null ? null : hoursBetween(facts.now, last);
  if (last !== null && lagHours === null) {
    // committed_at は空文字を許容する CHECK 制約を持つ（trail-activity のスキーマ）。
    // 解釈できない値を 0 時間として扱うと「取込は新鮮」と誤って報告してしまう。
    return finding(
      'D2',
      title,
      'error',
      'unmeasurable',
      `測定不能: 最終取込の日時を解釈できない（${JSON.stringify(last)}）`,
      { lastCommittedAt: last },
    );
  }
  if (Number.isNaN(Date.parse(facts.git.headCommittedAt))) {
    return finding('D2', title, 'error', 'unmeasurable', '測定不能: git の最新コミット日時を解釈できない');
  }

  const hasNewer = last === null || Date.parse(facts.git.headCommittedAt) > Date.parse(last);
  const stale = last === null || lagHours > STALE_HOURS;
  const fired = stale && hasNewer;
  const lagText = last === null ? '取込 0 件' : `${lagHours.toFixed(1)} 時間前（${last}）`;
  return finding(
    'D2',
    title,
    'error',
    fired ? 'fired' : 'ok',
    `最終取込 ${lagText} / git HEAD ${facts.git.headCommittedAt}` +
      `${fired ? ` — ${STALE_HOURS} 時間超の遅れがあり、未取込のコミットが存在する` : ''}` +
      `（集計範囲: ${facts.ingest.scope}）`,
    { lastCommittedAt: last, headCommittedAt: facts.git.headCommittedAt, scope: facts.ingest.scope },
  );
}

/** D3: パイプラインの恒常 skip。 */
function judgeD3(facts, trailAbsent) {
  const title = 'パイプラインの恒常 skip';
  if (trailAbsent) return outOfScope(facts, 'D3', title, 'warn');
  if (facts.pipelines.status !== 'ok') {
    return finding('D3', title, 'warn', 'unmeasurable', `測定不能: ${facts.pipelines.reason}`);
  }
  const stuck = facts.pipelines.scopes.filter((s) => s.skipStreak >= SKIP_STREAK);
  return finding(
    'D3',
    title,
    'warn',
    stuck.length > 0 ? 'fired' : 'ok',
    stuck.length === 0
      ? `直近 ${SKIP_STREAK} 回連続 skipped の scope は無し（対象 ${facts.pipelines.scopes.length} scope）`
      : stuck
          .map((s) => `${s.scope}: ${s.skipStreak} 回連続 skipped（理由: ${s.reasonCodes.join(' / ') || '記録なし'}）`)
          .join(' / '),
    { stuck },
  );
}

/** D4: LLM 到達性。 */
function judgeD4(facts, trailAbsent) {
  const title = 'LLM 到達性';
  if (trailAbsent) return outOfScope(facts, 'D4', title, 'warn');
  if (facts.llm.length === 0) {
    return finding('D4', title, 'warn', 'ok', 'lep.json に llm.providers の定義が無い');
  }
  const skipped = facts.llm.filter((p) => p.status === 'skipped');
  const bad = facts.llm.filter((p) => p.status === 'unreachable');
  let status = 'ok';
  if (bad.length > 0) status = 'fired';
  else if (skipped.length === facts.llm.length) status = 'unmeasurable';

  const detail = facts.llm
    .map((p) => {
      const localhost = /^https?:\/\/(localhost|127\.0\.0\.1)\b/.test(p.baseUrl);
      const hint =
        p.status === 'unreachable' && facts.inContainer && localhost
          ? '（Dev Container 内のため host.docker.internal を推奨）'
          : '';
      return `${p.provider}: ${p.baseUrl} → ${p.detail}${hint}`;
    })
    .join(' / ');
  return finding('D4', title, 'warn', status, detail, { providers: facts.llm });
}

/**
 * D5: lep.json の stage 検証。
 *
 * stage は任意項目で、未指定なら内蔵 default（disabled）が効く（LepConfig の
 * validateStageAndVersion は raw['stage'] !== undefined でガードしている）。未指定を
 * 不正値として報告すると、設計上の正常形に対して恒常的な誤警報になる。
 */
function judgeD5(facts, trailAbsent) {
  const title = 'lep.json の値検証';
  if (trailAbsent) return outOfScope(facts, 'D5', title, 'warn');
  if (facts.lep.loadedPaths.length === 0) {
    return finding('D5', title, 'warn', 'unmeasurable', `測定不能: lep.json が無い（探索: ${facts.lep.candidates.join(', ')}）`);
  }
  if (facts.lep.config === null) {
    return finding('D5', title, 'warn', 'unmeasurable', `測定不能: ${facts.lep.loadedPaths.join(', ')} を解析できない`);
  }

  const stage = facts.lep.config.stage;
  const source = `解決元: ${facts.lep.loadedPaths.join(' < ')}`;
  const failed = facts.lep.failedPaths ?? [];
  if (failed.length > 0) {
    // 解析できないファイルの設定は production でも全て無視される。stage が許容値でも、
    // 上位 tier が丸ごと効いていない事実のほうが重い。
    return finding(
      'D5',
      title,
      'warn',
      'fired',
      `解析できない設定ファイルがある: ${failed.map((p) => `${p.file}（${p.reason}）`).join(' / ')}` +
        ` — このファイルの設定は production でも全て無視される。${source}`,
      { failedPaths: failed, stage },
    );
  }
  if (stage === undefined) {
    return finding('D5', title, 'warn', 'ok', `stage 未指定 — 内蔵 default "disabled" が効く（${source}）`, { stage });
  }
  if (VALID_STAGES.includes(stage)) {
    return finding('D5', title, 'warn', 'ok', `stage="${stage}"（許容値。${source}）`, { stage });
  }
  const caseOnly = typeof stage === 'string' && VALID_STAGES.includes(stage.toLowerCase());
  return finding(
    'D5',
    title,
    'warn',
    'fired',
    `stage=${JSON.stringify(stage)} は許容集合外` +
      `${caseOnly ? `（大文字小文字のみ不一致。正しくは "${String(stage).toLowerCase()}"）` : ''}` +
      ` — 起動時にフォールバックが起き、指定した Wave は実行されない。許容値: ${VALID_STAGES.join(' / ')}。${source}`,
    { stage, validStages: VALID_STAGES },
  );
}

/**
 * D6: ドキュメント索引。
 *
 * 本スクリプトは全ユーザーのワークスペースへ素のまま展開されるため、索引機能そのものを
 * 使っていない環境（docsRoot 未設定かつ .anytime/markdown が無い）は「未導入」として
 * 対象外にする。D1〜D5 と同じく、未導入と故障を混同しない。
 */
function judgeD6(facts) {
  const title = 'ドキュメント索引';
  const { docsRoot, catalogDbPath, catalogExists, markdownDirExists } = facts.docIndex;
  const docsRootEmpty = docsRoot === null || docsRoot === '';

  if (docsRootEmpty && !markdownDirExists) {
    return finding(
      'D6',
      title,
      'warn',
      'not-applicable',
      `対象外: ${SETTING_DOCS_ROOT} 未設定かつ ${path.dirname(catalogDbPath)} が無い（ドキュメント索引 未導入）`,
      facts.docIndex,
    );
  }
  if (docsRootEmpty) {
    return finding(
      'D6',
      title,
      'warn',
      'fired',
      `${SETTING_DOCS_ROOT} が空（拡張はドキュメント索引を無効化する）。${path.dirname(catalogDbPath)} は在るため設定の欠落が疑われる`,
      facts.docIndex,
    );
  }
  if (!catalogExists) {
    return finding('D6', title, 'warn', 'fired', `${SETTING_DOCS_ROOT}=${docsRoot} だが ${catalogDbPath} が無い`, facts.docIndex);
  }
  return finding('D6', title, 'warn', 'ok', `${SETTING_DOCS_ROOT}=${docsRoot} / ${catalogDbPath} あり`, facts.docIndex);
}

/**
 * D7: 他プロジェクトの設定残骸。
 *
 * ワークスペース外そのものは異常ではない。docsRoot を意図的に外部リポジトリへ置く運用が
 * あるため、CLAUDE.md が「- docsRoot: <path>」で宣言した値と一致するパスは設計として除外する。
 */
function judgeD7(facts) {
  const title = '他プロジェクトの設定残骸';
  const workspace = facts.workspaceRealPath ?? facts.workspaceRoot;
  const outside = facts.referencedPaths.filter((p) => {
    const target = p.realPath ?? p.path;
    return (
      target !== workspace &&
      !target.startsWith(`${workspace}${path.sep}`) &&
      !(facts.declaredDocsRoot !== null && target === facts.declaredDocsRoot)
    );
  });
  return finding(
    'D7',
    title,
    'warn',
    outside.length > 0 ? 'fired' : 'ok',
    outside.length === 0
      ? '参照パスはすべてワークスペース内（または CLAUDE.md が宣言した docsRoot）'
      : outside.map((p) => `${p.origin}=${p.path}（${p.exists ? '実在する' : '実在しない'}）`).join(' / '),
    { outside },
  );
}

const JUDGES = [judgeD1, judgeD2, judgeD3, judgeD4, judgeD5, judgeD6, judgeD7];

/**
 * 収集済みの事実から D1〜D7 を判定する（純関数・I/O なし）。
 * status: fired = 判定条件に該当 / ok = 該当なし / unmeasurable = 測れなかった（0 ではない）/
 *         not-applicable = 対象外（未導入）。
 */
function judge(facts) {
  const trailAbsent = facts.dbDir.exists !== true;
  return JUDGES.map((fn) => fn(facts, trailAbsent));
}

function summarize(findings) {
  const fired = findings.filter((f) => f.status === 'fired');
  return {
    error: fired.filter((f) => f.severity === 'error').length,
    warn: fired.filter((f) => f.severity === 'warn').length,
    unmeasurable: findings.filter((f) => f.status === 'unmeasurable').length,
    notApplicable: findings.filter((f) => f.status === 'not-applicable').length,
  };
}

module.exports = {
  judge,
  judgeD1,
  judgeD2,
  judgeD3,
  judgeD4,
  judgeD5,
  judgeD6,
  judgeD7,
  summarize,
  hoursBetween,
  STALE_HOURS,
  SKIP_STREAK,
  VALID_STAGES,
  SETTING_WORKSPACE_PATH,
  SETTING_LEP_CONFIG_PATH,
  SETTING_DOCS_ROOT,
};

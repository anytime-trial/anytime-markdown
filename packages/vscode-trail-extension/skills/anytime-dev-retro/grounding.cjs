#!/usr/bin/env node
/**
 * anytime-dev-retro: 決定論的 grounding。
 *
 * Trail の 3DB(memory-core / doc-core / trail)を read-only で集計し、開発健全性の
 * signals snapshot を JSON で **stdout に出力** する。LLM 非依存・MCP 非依存(node:sqlite)
 * なので headless `claude -p` / cron でも完走する。
 *
 * 使い方:
 *   node grounding.cjs [dbDir]
 *   dbDir 省略時は <cwd>/.anytime/trail/db → /anytime-markdown/.anytime/trail/db の順で探索。
 *
 * 出力はそのまま <docs>/report/_signals/<YYYYMMDD>.json に保存してデルタ比較に使う。
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveDbDir() {
  // 解決順: 明示引数 → ワークスペース(cwd)相対。Trail は <workspace>/.anytime/trail/db に DB を置く。
  // 配布物(.vsix 同梱)として任意ユーザー環境で動くよう、開発機固有の絶対パスは持たない。
  const candidates = [process.argv[2], path.join(process.cwd(), '.anytime', 'trail', 'db')].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'trail.db'))) return c;
  }
  return candidates[candidates.length - 1];
}

const DB_DIR = resolveDbDir();

function open(file) {
  const p = path.join(DB_DIR, file);
  try {
    return { db: new DatabaseSync(p, { readOnly: true }), error: null };
  } catch (e) {
    return { db: null, error: `open failed ${p}: ${e.message}` };
  }
}

/**
 * 1 行 1 値 / 複数行を安全に取得。失敗時は {error} を返し全体を止めないが、
 * snapshot.errors にも記録する（クエリの silent 失敗で誤った 0/[] を出さないため）。
 */
function q(db, sql, params = []) {
  if (!db) return { error: 'db unavailable' };
  try {
    return { rows: db.prepare(sql).all(...params) };
  } catch (e) {
    snapshot.errors.push({ sql: sql.replace(/\s+/g, ' ').trim().slice(0, 70), error: e.message });
    return { error: e.message };
  }
}
const rows = (r) => (r && r.rows ? r.rows : []);
const one = (r) => (rows(r)[0] ?? null);
const num = (r, key, def = 0) => {
  const o = one(r);
  return o && o[key] != null ? o[key] : def;
};
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// コスト行(model / sessions / cost / cache_read / input)からシェア指標を導出する。
// 全期間版と 30 日ウィンドウ版で同一ロジックを共有し、集計方法の差による比較不能を防ぐ。
function summarizeCost(cost) {
  const totalCost = cost.reduce((s, r) => s + (r.cost || 0), 0);
  const opus = cost.find((r) => /opus/i.test(r.model || ''));
  const totalCacheRead = cost.reduce((s, r) => s + (r.cache_read || 0), 0);
  const totalInput = cost.reduce((s, r) => s + (r.input || 0), 0);
  return {
    byModel: cost.map((r) => ({ model: r.model, sessions: r.sessions, cost: r.cost })),
    totalCost: Math.round(totalCost * 100) / 100,
    opusCostSharePct: pct(opus ? opus.cost || 0 : 0, totalCost),
    cacheReadSharePct: pct(totalCacheRead, totalCacheRead + totalInput),
  };
}

// コストシグナルのウィンドウ幅(日)。windowDays メタ値と windowed SQL の窓を単一ソースで揃える
// (散在リテラルだと表示窓と集計窓が乖離しうる)。変更時は出力キー costWindow30d の名称と
// SKILL.md の参照(costWindow30d.*)も併せて更新すること。
const WINDOW_DAYS = 30;

const snapshot = { generatedAt: new Date().toISOString(), dbDir: DB_DIR, errors: [] };

// ── trail.db: コスト・活動・hotspot ────────────────────────────────────────────
{
  const { db, error } = open('trail.db');
  if (error) snapshot.errors.push(error);

  // コスト(モデル別・全期間累積)
  const cost = rows(q(db, `SELECT model, COUNT(*) sessions, ROUND(SUM(estimated_cost_usd),2) cost,
       SUM(cache_read_tokens) cache_read, SUM(input_tokens) input
     FROM session_costs GROUP BY model ORDER BY cost DESC`));
  snapshot.cost = summarizeCost(cost);

  // コスト(直近 30 日ウィンドウ)。opusCostSharePct/cacheReadSharePct/sessionsOver1000Msgs は
  // 全期間累積では単調増加し「増加=悪化」判定が構造的に偽陽性を出すため、真のデルタは本ウィンドウ値で見る。
  // session_costs に日時列は無いため sessions.start_time で窓を切る(start_time 空/NULL のセッションは窓外扱い)。
  // WINDOW_DAYS は数値定数のためテンプレート埋め込みでも SQL インジェクション懸念なし
  const costW = rows(q(db, `SELECT sc.model, COUNT(*) sessions, ROUND(SUM(sc.estimated_cost_usd),2) cost,
       SUM(sc.cache_read_tokens) cache_read, SUM(sc.input_tokens) input
     FROM session_costs sc JOIN sessions s ON s.id = sc.session_id
     WHERE s.start_time >= datetime('now','-${WINDOW_DAYS} days')
     GROUP BY sc.model ORDER BY cost DESC`));
  const wCost = summarizeCost(costW);
  snapshot.costWindow30d = {
    windowDays: WINDOW_DAYS,
    totalCost: wCost.totalCost,
    opusCostSharePct: wCost.opusCostSharePct,
    cacheReadSharePct: wCost.cacheReadSharePct,
    // 累積 sessionsOver1000Msgs と同じ算定方法(messages GROUP BY)を窓内に限定して整合させる
    sessionsOver1000Msgs: num(
      q(db, `SELECT COUNT(*) c FROM (
               SELECT m.session_id FROM messages m JOIN sessions s ON s.id = m.session_id
               WHERE s.start_time >= datetime('now','-${WINDOW_DAYS} days')
               GROUP BY m.session_id HAVING COUNT(*) > 1000)`),
      'c',
    ),
  };

  // モデル別挙動プロファイル(直近 30 日ウィンドウ・記述的)。役割分担見直しの材料として
  // モデルごとの冗長性・ツール失敗率・実行時間を可視化する。
  // 注意: タスク割当が非ランダム(機械作業は haiku 等、性質でモデルを選んでいる)ため、
  //   モデル間の差は「性格」でなく割当タスクの性質を含む交絡を持つ。因果主張はしない。
  // キーは両クエリとも本体 model(フル ID)で統一する。agent_model は短縮別名
  //   (sonnet/haiku/opus)で粒度が異なり、mtc.model(=msg.model のフル ID)と突合すると
  //   同一モデルが 2 エントリに分裂するため使わない(実測: agent_model のみで model 空の
  //   assistant 行は 0 件のため統一による損失なし。レビュー warn 対処 2026-07-16)。
  const verbosity = rows(
    q(
      db,
      `SELECT NULLIF(m.model,'') model,
              COUNT(*) assistantMsgs, ROUND(AVG(m.output_tokens)) avgOutputTokens
       FROM messages m JOIN sessions s ON s.id = m.session_id
       WHERE m.type = 'assistant' AND m.model IS NOT NULL AND m.model != ''
         AND s.start_time >= datetime('now','-${WINDOW_DAYS} days')
       GROUP BY 1`,
    ),
  );
  // has_thinking は ingest 側で常に 0 固定(ClaudeCodeBehaviorAnalyzer)のため熟考率は出さない。
  // ingest が thinking ブロック検出に対応したら列を復活させる。
  const toolBehavior = rows(
    q(
      db,
      `SELECT NULLIF(mtc.model,'') model, COUNT(*) toolCalls,
              ROUND(100.0*SUM(mtc.is_error)/COUNT(*),1) toolErrorRatePct,
              ROUND(AVG(mtc.turn_exec_ms)) avgTurnExecMs
       FROM message_tool_calls mtc JOIN sessions s ON s.id = mtc.session_id
       WHERE mtc.model IS NOT NULL AND mtc.model != ''
         AND s.start_time >= datetime('now','-${WINDOW_DAYS} days')
       GROUP BY 1`,
    ),
  );
  const behaviorByModel = new Map();
  for (const r of verbosity) {
    behaviorByModel.set(r.model, {
      model: r.model,
      assistantMsgs: r.assistantMsgs,
      avgOutputTokens: r.avgOutputTokens,
      toolCalls: null,
      toolErrorRatePct: null,
      avgTurnExecMs: null,
    });
  }
  for (const r of toolBehavior) {
    const entry = behaviorByModel.get(r.model) ?? {
      model: r.model,
      assistantMsgs: null,
      avgOutputTokens: null,
    };
    entry.toolCalls = r.toolCalls;
    entry.toolErrorRatePct = r.toolErrorRatePct;
    entry.avgTurnExecMs = r.avgTurnExecMs;
    behaviorByModel.set(r.model, entry);
  }
  snapshot.modelBehavior = {
    windowDays: WINDOW_DAYS,
    // 標本 5 件未満のモデルは判定しない(委任成績と同じ少数標本抑制)。データは残しレポートで明示。
    minSampleForJudgment: 5,
    byModel: [...behaviorByModel.values()].sort(
      (a, b) => (b.assistantMsgs ?? 0) - (a.assistantMsgs ?? 0),
    ),
  };

  // 活動
  snapshot.activity = {
    sessions: num(q(db, 'SELECT COUNT(*) c FROM sessions'), 'c'),
    messagesLast7d: num(q(db, "SELECT COUNT(*) c FROM messages WHERE timestamp >= datetime('now','-7 days')"), 'c'),
    commitsLast7d: num(q(db, "SELECT COUNT(*) c FROM session_commits WHERE committed_at >= datetime('now','-7 days')"), 'c'),
    sessionsOver1000Msgs: num(
      q(db, 'SELECT COUNT(*) c FROM (SELECT session_id FROM messages GROUP BY session_id HAVING COUNT(*) > 1000)'),
      'c',
    ),
  };

  // hotspot(認知的複雑度 top・規約 cc<=15)
  snapshot.hotspots = rows(
    q(db, `SELECT file_path, function_name, cognitive_complexity cc
           FROM current_function_analysis ORDER BY cognitive_complexity DESC LIMIT 10`),
  ).map((r) => ({ file: r.file_path, fn: r.function_name, cc: r.cc }));
  snapshot.hotspotOver15 = num(
    q(db, 'SELECT COUNT(*) c FROM current_function_analysis WHERE cognitive_complexity > 15'),
    'c',
  );

  if (db) db.close();
}

// ── memory-core.db: 品質・drift ────────────────────────────────────────────────
{
  const { db, error } = open('memory-core.db');
  if (error) snapshot.errors.push(error);

  const bugFixes = num(q(db, 'SELECT COUNT(*) c FROM memory_bug_fixes'), 'c');
  const reviewFindings = num(q(db, 'SELECT COUNT(*) c FROM memory_review_findings'), 'c');
  snapshot.quality = {
    bugFixes,
    reviewFindings,
    bugToReviewRatio: reviewFindings > 0 ? Math.round((bugFixes / reviewFindings) * 10) / 10 : null,
    findingsBySeverity: rows(q(db, 'SELECT severity, COUNT(*) c FROM memory_review_findings GROUP BY severity')),
    addressedFindings: num(q(db, 'SELECT COUNT(*) c FROM memory_review_findings WHERE addressed_commit_sha IS NOT NULL'), 'c'),
    unaddressedFindings: num(q(db, 'SELECT COUNT(*) c FROM memory_review_findings WHERE addressed_commit_sha IS NULL'), 'c'),
    reviewsTotal: num(q(db, 'SELECT COUNT(*) c FROM memory_reviews'), 'c'),
    reviewerEmpty: num(q(db, "SELECT COUNT(*) c FROM memory_reviews WHERE reviewer = '' OR reviewer IS NULL"), 'c'),
    topBugFiles: rows(
      q(db, `SELECT json_each.value file, COUNT(*) c FROM memory_bug_fixes, json_each(affected_file_paths_json)
             GROUP BY 1 ORDER BY c DESC LIMIT 8`),
    ).map((r) => ({ file: r.file, count: r.c })),
    // 観点キー (P2): checklist_ref='none' はチェックリスト該当章なし＝観点の穴の候補。
    // カテゴリ×パッケージで束ね 2 件以上を昇格候補クラスタとして掲載する。
    // 列は memory-core migration 015 で追加。未マイグレーション DB では null（測定不能）。
    ...(num(q(db, "SELECT COUNT(*) c FROM pragma_table_info('memory_review_findings') WHERE name = 'checklist_ref'"), 'c') > 0
      ? {
          checklistNone: num(q(db, "SELECT COUNT(*) c FROM memory_review_findings WHERE checklist_ref = 'none'"), 'c'),
          checklistRefRecorded: num(q(db, 'SELECT COUNT(*) c FROM memory_review_findings WHERE checklist_ref IS NOT NULL'), 'c'),
          checklistNoneClusters: rows(
            q(db, `SELECT category,
                     CASE WHEN target_file_path GLOB 'packages/*/*'
                          THEN substr(target_file_path, 10, instr(substr(target_file_path, 10), '/') - 1)
                          ELSE '(unknown)' END pkg,
                     COUNT(*) c
                   FROM memory_review_findings
                   WHERE checklist_ref = 'none'
                   GROUP BY category, pkg
                   HAVING c >= 2
                   ORDER BY c DESC LIMIT 12`),
          ).map((r) => ({ category: r.category, package: r.pkg, count: r.c })),
        }
      : { checklistNone: null, checklistRefRecorded: null, checklistNoneClusters: null }),
  };

  snapshot.drift = {
    total: num(q(db, 'SELECT COUNT(*) c FROM memory_drift_events'), 'c'),
    unresolved: num(q(db, 'SELECT COUNT(*) c FROM memory_drift_events WHERE resolved_at IS NULL'), 'c'),
    byType: rows(q(db, 'SELECT drift_type, COUNT(*) c FROM memory_drift_events GROUP BY drift_type ORDER BY c DESC')),
  };

  if (db) db.close();
}

// ── doc-core.db: セマンティック検索充足 ────────────────────────────────────────
{
  const { db, error } = open('doc-core.db');
  if (error) snapshot.errors.push(error);

  const docs = num(q(db, 'SELECT COUNT(*) c FROM doc'), 'c');
  const embeddings = num(q(db, 'SELECT COUNT(*) c FROM doc_embedding'), 'c');
  snapshot.docCore = {
    docs,
    relations: num(q(db, 'SELECT COUNT(*) c FROM doc_relation'), 'c'),
    embeddings,
    embeddingCoveragePct: pct(embeddings, docs),
    orphanDocs: num(
      q(db, 'SELECT COUNT(*) c FROM doc WHERE path NOT IN (SELECT from_path FROM doc_relation UNION SELECT to_path FROM doc_relation)'),
      'c',
    ),
  };

  if (db) db.close();
}

// ── source: SHORTCUT 技術負債マーカー(read-only 走査) ──────────────────────────
// DB 非依存。ソースの意図的簡略化マーカーを台帳化し no-trigger(昇格経路欠落)を高リスクとして数える。
// 走査基点は cwd(ワークスペースルート。SKILL.md 記載の起動方法では cwd=workspace)。
// DB_DIR を起点にすると引数付き起動で高位ディレクトリへ解決し得るため cwd に固定する。
{
  const WS_ROOT = process.cwd();
  const SKIP_DIRS = new Set([
    'node_modules', 'dist', 'out', 'build', '.git', '.anytime',
    '.next', 'coverage', '.worktrees', '.vscode-test',
  ]);
  const EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs']);
  // 判定は shortcutMarkers.cjs に一本化(CI ゲート scripts/check-shortcut-markers.mjs と同一実装。
  // 折り返しコメント行を 1 ブロックとして ceiling/upgrade を判定する)。
  const { collectShortcutMarkers, MARKER_NEEDLE } = require('./shortcutMarkers.cjs');
  const MAX_FILES = 20000;
  const markers = [];
  let scanned = 0;
  let truncated = false;

  // 1 ファイルを行走査して marker を収集(walk の認知的複雑度を S3776<=15 に抑えるため分離)。
  function scanFile(full) {
    let text;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch (e) {
      snapshot.errors.push(`techDebt read failed ${full}: ${e.message}`);
      return;
    }
    if (!text.includes(MARKER_NEEDLE)) return;
    const rel = path.relative(WS_ROOT, full);
    for (const m of collectShortcutMarkers(text)) {
      markers.push({ file: rel, line: m.line, noTrigger: !m.hasUpgrade });
    }
  }

  function walk(dir) {
    if (scanned >= MAX_FILES) { truncated = true; return; }
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (e) {
      snapshot.errors.push(`techDebt walk failed ${dir}: ${e.message}`);
      return;
    }
    // 名前順で走査し marker/サンプル順を決定的にする(プラットフォーム間のスナップショット差分ノイズ防止)。
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const ent of entries) {
      if (scanned >= MAX_FILES) { truncated = true; return; }
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(full);
        continue;
      }
      const isTarget = ent.isFile() && EXT.has(path.extname(ent.name));
      if (!isTarget) continue;
      scanned++;
      scanFile(full);
    }
  }

  try {
    walk(WS_ROOT);
    // 上限到達で静かに打ち切ると過小カウントを「改善」と誤読し得るため明示記録する。
    if (truncated) snapshot.errors.push(`techDebt scan truncated at MAX_FILES=${MAX_FILES}`);
    const noTrigger = markers.filter((m) => m.noTrigger).length;
    const byFile = {};
    for (const m of markers) byFile[m.file] = (byFile[m.file] || 0) + 1;
    snapshot.techDebt = {
      shortcutMarkers: markers.length,
      noTriggerMarkers: noTrigger,
      noTriggerSharePct: pct(noTrigger, markers.length),
      topFiles: Object.entries(byFile)
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 8)
        .map(([file, count]) => ({ file, count })),
      noTriggerSamples: markers.filter((m) => m.noTrigger).slice(0, 8).map((m) => `${m.file}:${m.line}`),
      filesScanned: scanned,
      truncated,
    };
  } catch (e) {
    snapshot.errors.push(`techDebt scan failed: ${e.message}`);
  }
}

// ── source+trail: スキル健全性(鮮度・利用実績・参照切れ) ─────────────────────
{
  try {
    const WS_ROOT = process.cwd();
    const skillsDirs = [
      path.join(WS_ROOT, '.claude', 'skills'),
      path.join(os.homedir(), '.claude', 'skills'),
    ].filter((d) => fs.existsSync(d));
    const inventory = [];
    for (const dir of skillsDirs) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const f = path.join(dir, e.name, 'SKILL.md');
        if (!fs.existsSync(f)) continue;
        const m = /^更新日: (\d{4}-\d{2}-\d{2})/m.exec(fs.readFileSync(f, 'utf-8'));
        inventory.push({ name: e.name, updated: m ? m[1] : null });
      }
    }
    const STALE_DAYS = 90;
    const staleBefore = Date.now() - STALE_DAYS * 86400000;
    const stale = inventory.filter((s) => s.updated && Date.parse(s.updated) < staleBefore).map((s) => s.name);

    const { db, error } = open('trail.db');
    if (error) snapshot.errors.push(error);
    const usage = rows(
      q(db, `SELECT skill, COUNT(*) n FROM messages
             WHERE skill IS NOT NULL AND skill != '' AND timestamp >= datetime('now','-30 days')
             GROUP BY skill ORDER BY n DESC`),
    );
    // 前 30 日窓(60〜30 日前)。版数バンプ(改訂)後に発火が減ったかを 2 窓比較で判定する材料
    // (proposal/20260716-prompt-feedback-loops)。判定自体は SKILL.md §2 のデルタ比較が行う。
    const usagePrev = rows(
      q(db, `SELECT skill, COUNT(*) n FROM messages
             WHERE skill IS NOT NULL AND skill != ''
               AND timestamp >= datetime('now','-60 days') AND timestamp < datetime('now','-30 days')
             GROUP BY skill`),
    );
    // messages.skill は 'superpowers:writing-plans' 等の名前空間付きで記録され得るため末尾名で突合する
    const used = new Set(usage.map((u) => String(u.skill).split(':').pop()));
    if (db) db.close();
    const prevMap = new Map(usagePrev.map((u) => [u.skill, u.n]));
    const windowNames = new Set([...usage.map((u) => u.skill), ...usagePrev.map((u) => u.skill)]);
    const usageWindows = [...windowNames]
      .map((s) => ({ skill: s, n30: usage.find((u) => u.skill === s)?.n ?? 0, prev30: prevMap.get(s) ?? 0 }))
      .sort((a, b) => b.n30 - a.n30);

    // 同梱スキルの版数(プロンプトアーカイブの版)。発火変化と紐付けて「改訂が効いたか」を測る。
    // 非モノレポ環境では manifest が無いため null(0 件と区別し「版数ゼロ」と誤読させない)
    let manifestVersions = null;
    try {
      const pkgsDir = path.join(WS_ROOT, 'packages');
      if (fs.existsSync(pkgsDir)) {
        for (const e of fs.readdirSync(pkgsDir, { withFileTypes: true })) {
          if (!e.isDirectory()) continue;
          const mf = path.join(pkgsDir, e.name, 'skills', 'manifest.json');
          if (!fs.existsSync(mf)) continue;
          manifestVersions = Object.assign(manifestVersions ?? {}, JSON.parse(fs.readFileSync(mf, 'utf-8')));
        }
      }
    } catch (e) {
      snapshot.errors.push(`skillHealth manifest scan failed: ${e.message}`);
    }

    const refs = spawnSync(
      process.execPath,
      [path.join(WS_ROOT, 'scripts', 'check-skill-refs.mjs'), '--json', ...skillsDirs],
      { encoding: 'utf-8' },
    );
    let brokenRefs = null; // 測定不能は null(0 と区別し「改善」と誤読させない)
    if (refs.stdout) {
      try {
        const parsed = JSON.parse(refs.stdout);
        brokenRefs = parsed.reduce((s, r) => s + r.missingRefs.length + r.missingScripts.length, 0);
      } catch (e) {
        snapshot.errors.push(`skillHealth refs parse failed: ${e.message}`);
      }
    } else {
      snapshot.errors.push(`skillHealth refs run failed: ${refs.error ? refs.error.message : refs.status}`);
    }

    snapshot.skillHealth = {
      total: inventory.length,
      noUpdateDate: inventory.filter((s) => !s.updated).length,
      staleOver90: stale.length,
      staleSamples: stale.slice(0, 8),
      // trail.db 不開時は usage が空になり「全スキル未使用」と誤読されるため測定不能 null にする(brokenRefs と同原則)
      unused30d: error ? null : inventory.filter((s) => !used.has(s.name)).length,
      unusedSamples: error ? null : inventory.filter((s) => !used.has(s.name)).map((s) => s.name).slice(0, 8),
      usageTop: error ? null : usage.slice(0, 10).map((u) => ({ skill: u.skill, n: u.n })),
      usageWindows: error ? null : usageWindows,
      manifestVersions,
      brokenRefs,
    };
  } catch (e) {
    snapshot.errors.push(`skillHealth scan failed: ${e.message}`);
  }
}

// ── docs: 委任成績(委譲契約テンプレの版数×結果) ─────────────────────────────
// plan ファイルの「- 委譲結果: 雛形vN <採用|差し戻し|abstain>」行を集計し、委任テンプレ改訂の
// 効果測定材料にする(proposal/20260716-prompt-feedback-loops)。記録書式は
// anytime-dev-cycle references/delegation.md が定義する(書式変更時は本正規表現も追随)。
{
  try {
    let docsRoot = null;
    const lep = path.join(process.cwd(), '.anytime', 'trail', 'lep.json');
    if (fs.existsSync(lep)) {
      docsRoot = JSON.parse(fs.readFileSync(lep, 'utf-8'))?.sources?.docs?.root || null;
    }
    const planDir = docsRoot ? path.join(docsRoot, 'plan') : null;
    if (planDir && fs.existsSync(planDir)) {
      // 末尾は \b でなく先読み: JS の \b は \w=[A-Za-z0-9_] 基準で日本語直後に成立せず
      // 「採用」「差し戻し」が永久に不一致になる(レビュー検出 2026-07-16)。
      // 版数の直後に任意の [model] タグを許す(後方互換: 省略時は旧書式で (unspecified))。
      // m[1]=版数, m[2]=モデル(任意), m[3]=結果。
      const OUTCOME_RE = /^- 委譲結果: 雛形v(\d+)(?: \[([^\]]+)\])? (採用|差し戻し|abstain)(?=\s|$)/;
      // 見積り・実測行(delegation.md §2.2 v3)。行頭固定・単位は out=k トークン / wall=分。
      // ペアリングは同一ファイル内で「直前の未ペア見積(同一モデル)」(LIFO)。
      const ESTIMATE_RE = /^- 委譲見積: \[([^\]]+)\] out≈(\d+(?:\.\d+)?)k \/ wall≈(\d+(?:\.\d+)?)m \/ カテゴリ=(\S+)/;
      const ACTUAL_RE = /^- 委譲実測: \[([^\]]+)\] out≈(\d+(?:\.\d+)?)k \/ wall≈(\d+(?:\.\d+)?)m(?=\s|$)/;
      const emptyTally = () => ({ 採用: 0, 差し戻し: 0, abstain: 0 });
      const byVersion = {};
      const byModel = {};
      let recorded = 0;
      let estRecorded = 0;
      let actRecorded = 0;
      const pairs = []; // { category, model, estOutK, estWallM, actOutK, actWallM }
      for (const f of fs.readdirSync(planDir)) {
        if (!f.endsWith('.md')) continue;
        const pendingByModel = {}; // model -> 未ペア見積のスタック(ファイル内で閉じる)
        for (const line of fs.readFileSync(path.join(planDir, f), 'utf-8').split('\n')) {
          const m = OUTCOME_RE.exec(line);
          if (m) {
            recorded += 1;
            const v = `v${m[1]}`;
            const model = m[2] || '(unspecified)';
            const outcome = m[3];
            byVersion[v] = byVersion[v] ?? emptyTally();
            byVersion[v][outcome] += 1;
            byModel[model] = byModel[model] ?? emptyTally();
            byModel[model][outcome] += 1;
            continue;
          }
          const est = ESTIMATE_RE.exec(line);
          if (est) {
            estRecorded += 1;
            (pendingByModel[est[1]] = pendingByModel[est[1]] ?? []).push({
              model: est[1], estOutK: Number(est[2]), estWallM: Number(est[3]), category: est[4],
            });
            continue;
          }
          const act = ACTUAL_RE.exec(line);
          if (act) {
            actRecorded += 1;
            const stack = pendingByModel[act[1]];
            const e = stack && stack.length ? stack.pop() : null;
            if (e) {
              pairs.push({ ...e, actOutK: Number(act[2]), actWallM: Number(act[3]) });
            }
          }
        }
      }
      // referenceClass: カテゴリ×モデル別の実測・誤差比(actual/estimate)の中央値。
      // 判定(n>=5 等)は SKILL.md 側。ここは記述値のみ出力する。
      const median = (arr) => {
        const s = [...arr].sort((a, b) => a - b);
        const mid = s.length >> 1;
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
      };
      const round2 = (x) => Math.round(x * 100) / 100;
      const groups = {};
      for (const p of pairs) {
        const k = `${p.category} ${p.model}`;
        (groups[k] = groups[k] ?? []).push(p);
      }
      const referenceClass = Object.values(groups)
        .map((g) => ({
          category: g[0].category,
          model: g[0].model,
          n: g.length,
          medianActualOutK: round2(median(g.map((p) => p.actOutK))),
          medianActualWallM: round2(median(g.map((p) => p.actWallM))),
          // 見積り 0 は書式上あり得るため除外せず Infinity を許さない: 0 見積りは誤差比 null
          medianErrorOut: g.some((p) => p.estOutK === 0) ? null : round2(median(g.map((p) => p.actOutK / p.estOutK))),
          medianErrorWall: g.some((p) => p.estWallM === 0) ? null : round2(median(g.map((p) => p.actWallM / p.estWallM))),
        }))
        .sort((a, b) => b.n - a.n);
      const estimates = {
        recorded: estRecorded,
        actuals: actRecorded,
        paired: pairs.length,
        unpairedEstimates: estRecorded - pairs.length,
        unpairedActuals: actRecorded - pairs.length,
        referenceClass,
      };
      snapshot.delegation = { docsRoot, recorded, byVersion, byModel, estimates };
    } else {
      // docs root 未解決・plan 不在は測定不能 null(0 件と区別し「記録ゼロ」と誤読させない)
      snapshot.delegation = { docsRoot, recorded: null, byVersion: null, byModel: null, estimates: null };
    }
  } catch (e) {
    snapshot.errors.push(`delegation scan failed: ${e.message}`);
  }
}

// ── memory: 再発検知(「2 回再発で昇格」ルールの決定論走査) ─────────────────────
// ~/.claude/CLAUDE.md メモリ運用の昇格判断(罠の再発→constraint 化)を記憶頼みにしないための候補提示。
// 検出のみで自動書き込みはしない(メモリ領域は保護領域)。
{
  try {
    const { encodeProjectDir, detectDanglingClusters, findUncoveredBugFiles, scanMemoryDir } = require('./recurrence.cjs');
    const memoryDir = process.env.ANYTIME_MEMORY_DIR
      || path.join(os.homedir(), '.claude', 'projects', encodeProjectDir(process.cwd()), 'memory');
    const { available, memories, errors } = scanMemoryDir(memoryDir);
    snapshot.errors.push(...(errors ?? []));
    // dir 不在は測定不能 null(0 と区別し「候補なし」と誤読させない。skillHealth の brokenRefs と同原則)
    snapshot.recurrence = available
      ? {
          memoryDir,
          memoryCount: memories.length,
          feedbackMemoryCount: memories.filter((m) => m.type === 'feedback').length,
          danglingClusters: detectDanglingClusters(memories).slice(0, 8),
          uncoveredBugFiles: findUncoveredBugFiles((snapshot.quality ?? {}).topBugFiles, memories).slice(0, 8),
        }
      : { memoryDir, memoryCount: null, feedbackMemoryCount: null, danglingClusters: null, uncoveredBugFiles: null };
  } catch (e) {
    snapshot.errors.push(`recurrence scan failed: ${e.message}`);
  }
}

process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');

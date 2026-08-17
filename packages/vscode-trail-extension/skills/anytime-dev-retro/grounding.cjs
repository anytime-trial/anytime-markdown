#!/usr/bin/env node
/**
 * anytime-dev-retro: 決定論的 grounding。
 *
 * Trail の 3DB(trail-caravan-book / markdown-catalog / trail)を read-only で集計し、開発健全性の
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
    if (fs.existsSync(path.join(c, 'activity.db'))) return c;
  }
  return candidates[candidates.length - 1];
}

const DB_DIR = resolveDbDir();

// catalog.db（ドキュメント検索・旧 doc-core.db）は trail DB 群と別系統で
// <workspace>/.anytime/markdown に置かれる（owner は markdown 拡張の ingest）。
// trail 側 DB_DIR から開くと通常環境で常に不在エラーになり docCore 指標が測定不能になる。
// 移行前ワークスペース（旧名のみ実在）は旧名へフォールバックする。
function resolveDocDbPath() {
  const dir = path.join(process.cwd(), '.anytime', 'markdown');
  const current = path.join(dir, 'catalog.db');
  if (fs.existsSync(current)) return current;
  const legacy = path.join(dir, 'doc-core.db');
  if (fs.existsSync(legacy)) return legacy;
  return current;
}

function open(file) {
  const p = path.isAbsolute(file) ? file : path.join(DB_DIR, file);
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

// ── activity.db: コスト・活動・hotspot ────────────────────────────────────────────
{
  const { db, error } = open('activity.db');
  if (error) snapshot.errors.push(error);

  // コスト(モデル別・全期間累積)
  const cost = rows(q(db, `SELECT model, COUNT(*) sessions, ROUND(SUM(estimated_cost_usd),2) cost,
       SUM(cache_read_tokens) cache_read, SUM(input_tokens) input
     FROM activity_session_costs GROUP BY model ORDER BY cost DESC`));
  snapshot.cost = summarizeCost(cost);

  // コスト(直近 30 日ウィンドウ)。opusCostSharePct/cacheReadSharePct/sessionsOver1000Msgs は
  // 全期間累積では単調増加し「増加=悪化」判定が構造的に偽陽性を出すため、真のデルタは本ウィンドウ値で見る。
  // activity_session_costs に日時列は無いため sessions.start_time で窓を切る(start_time 空/NULL のセッションは窓外扱い)。
  // WINDOW_DAYS は数値定数のためテンプレート埋め込みでも SQL インジェクション懸念なし
  const costW = rows(q(db, `SELECT sc.model, COUNT(*) sessions, ROUND(SUM(sc.estimated_cost_usd),2) cost,
       SUM(sc.cache_read_tokens) cache_read, SUM(sc.input_tokens) input
     FROM activity_session_costs sc JOIN activity_sessions s ON s.id = sc.session_id
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
               SELECT m.session_id FROM activity_messages m JOIN activity_sessions s ON s.id = m.session_id
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
       FROM activity_messages m JOIN activity_sessions s ON s.id = m.session_id
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
       FROM activity_message_tool_calls mtc JOIN activity_sessions s ON s.id = mtc.session_id
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
    sessions: num(q(db, 'SELECT COUNT(*) c FROM activity_sessions'), 'c'),
    messagesLast7d: num(q(db, "SELECT COUNT(*) c FROM activity_messages WHERE timestamp >= datetime('now','-7 days')"), 'c'),
    commitsLast7d: num(q(db, "SELECT COUNT(*) c FROM activity_session_commits WHERE committed_at >= datetime('now','-7 days')"), 'c'),
    sessionsOver1000Msgs: num(
      q(db, 'SELECT COUNT(*) c FROM (SELECT session_id FROM activity_messages GROUP BY session_id HAVING COUNT(*) > 1000)'),
      'c',
    ),
  };

  // hotspot(認知的複雑度 top・規約 cc<=15)
  snapshot.hotspots = rows(
    q(db, `SELECT file_path, function_name, cognitive_complexity cc
           FROM activity_current_function_analysis ORDER BY cognitive_complexity DESC LIMIT 10`),
  ).map((r) => ({ file: r.file_path, fn: r.function_name, cc: r.cc }));
  snapshot.hotspotOver15 = num(
    q(db, 'SELECT COUNT(*) c FROM activity_current_function_analysis WHERE cognitive_complexity > 15'),
    'c',
  );

  if (db) db.close();
}

// ── caravan-book.db: 品質・drift ────────────────────────────────────────────────
{
  const { db, error } = open('caravan-book.db');
  if (error) snapshot.errors.push(error);

  const bugFixes = num(q(db, 'SELECT COUNT(*) c FROM caravan_bug_fixes'), 'c');
  const reviewFindings = num(q(db, 'SELECT COUNT(*) c FROM caravan_review_findings'), 'c');
  snapshot.quality = {
    bugFixes,
    reviewFindings,
    bugToReviewRatio: reviewFindings > 0 ? Math.round((bugFixes / reviewFindings) * 10) / 10 : null,
    findingsBySeverity: rows(q(db, 'SELECT severity, COUNT(*) c FROM caravan_review_findings GROUP BY severity')),
    addressedFindings: num(q(db, 'SELECT COUNT(*) c FROM caravan_review_findings WHERE addressed_commit_sha IS NOT NULL'), 'c'),
    unaddressedFindings: num(q(db, 'SELECT COUNT(*) c FROM caravan_review_findings WHERE addressed_commit_sha IS NULL'), 'c'),
    reviewsTotal: num(q(db, 'SELECT COUNT(*) c FROM caravan_reviews'), 'c'),
    reviewerEmpty: num(q(db, "SELECT COUNT(*) c FROM caravan_reviews WHERE reviewer = '' OR reviewer IS NULL"), 'c'),
    topBugFiles: rows(
      q(db, `SELECT json_each.value file, COUNT(*) c FROM caravan_bug_fixes, json_each(affected_file_paths_json)
             GROUP BY 1 ORDER BY c DESC LIMIT 8`),
    ).map((r) => ({ file: r.file, count: r.c })),
    // 観点キー (P2): checklist_ref='none' はチェックリスト該当章なし＝観点の穴の候補。
    // カテゴリ×パッケージで束ね 2 件以上を昇格候補クラスタとして掲載する。
    // 列は trail-caravan-book migration 015 で追加。未マイグレーション DB では null（測定不能）。
    ...(num(q(db, "SELECT COUNT(*) c FROM pragma_table_info('caravan_review_findings') WHERE name = 'checklist_ref'"), 'c') > 0
      ? {
          checklistNone: num(q(db, "SELECT COUNT(*) c FROM caravan_review_findings WHERE checklist_ref = 'none'"), 'c'),
          checklistRefRecorded: num(q(db, 'SELECT COUNT(*) c FROM caravan_review_findings WHERE checklist_ref IS NOT NULL'), 'c'),
          checklistNoneClusters: rows(
            q(db, `SELECT category,
                     CASE WHEN target_file_path GLOB 'packages/*/*'
                          THEN substr(target_file_path, 10, instr(substr(target_file_path, 10), '/') - 1)
                          ELSE '(unknown)' END pkg,
                     COUNT(*) c
                   FROM caravan_review_findings
                   WHERE checklist_ref = 'none'
                   GROUP BY category, pkg
                   HAVING c >= 2
                   ORDER BY c DESC LIMIT 12`),
          ).map((r) => ({ category: r.category, package: r.pkg, count: r.c })),
          // 観点キー (P4): 章別・30 日窓の指摘件数。条文化した章の効果測定
          // （デルタで減らない章は書き方の見直し対象）に使う。累積でなく窓値。
          checklistByRef30d: rows(
            q(db, `SELECT checklist_ref, COUNT(*) c
                   FROM caravan_review_findings
                   WHERE checklist_ref IS NOT NULL AND checklist_ref != 'none'
                     AND recorded_at >= datetime('now', '-30 days')
                   GROUP BY checklist_ref
                   ORDER BY c DESC LIMIT 20`),
          ).map((r) => ({ checklist_ref: r.checklist_ref, count: r.c })),
        }
      : {
          checklistNone: null,
          checklistRefRecorded: null,
          checklistNoneClusters: null,
          checklistByRef30d: null,
        }),
  };

  snapshot.drift = {
    total: num(q(db, 'SELECT COUNT(*) c FROM caravan_drift_events'), 'c'),
    unresolved: num(q(db, 'SELECT COUNT(*) c FROM caravan_drift_events WHERE resolved_at IS NULL'), 'c'),
    byType: rows(q(db, 'SELECT drift_type, COUNT(*) c FROM caravan_drift_events GROUP BY drift_type ORDER BY c DESC')),
  };

  if (db) db.close();
}

// ── catalog.db: セマンティック検索充足 ────────────────────────────────────────
{
  const { db, error } = open(resolveDocDbPath());
  if (error) snapshot.errors.push(error);

  const docs = num(q(db, 'SELECT COUNT(*) c FROM catalog_doc'), 'c');
  const embeddings = num(q(db, 'SELECT COUNT(*) c FROM catalog_doc_embedding'), 'c');
  snapshot.docCore = {
    docs,
    relations: num(q(db, 'SELECT COUNT(*) c FROM catalog_doc_relation'), 'c'),
    embeddings,
    embeddingCoveragePct: pct(embeddings, docs),
    orphanDocs: num(
      q(db, 'SELECT COUNT(*) c FROM catalog_doc WHERE path NOT IN (SELECT from_path FROM catalog_doc_relation UNION SELECT to_path FROM catalog_doc_relation)'),
      'c',
    ),
  };

  if (db) db.close();
}

// ── caravan-book.db / activity.db(未移行): Flight Record(実行記録・指示台帳) ────────
// caravan_flight_reviews / instructions / caravan_instruction_sessions は 2026-08-07 に activity.db から
// caravan-book.db へ移設した。移行前の DB(旧拡張・バックフィル未実行)では activity.db 側に
// 残るため、テーブル実在で読み先を選ぶ。どちらにも無ければ null(測定不能。0 と区別する)。
{
  const hasTable = (db, name) =>
    db != null && rows(q(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name])).length > 0;
  const memo = open('caravan-book.db');
  if (memo.error) snapshot.errors.push(memo.error);
  let trailOpened = null;
  const openTrail = () => {
    if (trailOpened === null) {
      trailOpened = open('activity.db');
      if (trailOpened.error) snapshot.errors.push(trailOpened.error);
    }
    return trailOpened.db;
  };
  // 読み先は「テーブル実在」でなく**行数**で選ぶ。FlightRecordDatabase.ensureTables は
  // 空テーブルを常に作るため、実在判定だと移行未完了（行は trail 側に残存）の DB で
  // 空の trail-caravan-book 側を読み、0 件を測定不能でなく実測 0 として出してしまう。
  const countRows = (db, table) =>
    hasTable(db, table) ? Number(one(q(db, `SELECT COUNT(*) c FROM ${table}`))?.c ?? 0) : 0;
  const memoFr = countRows(memo.db, 'caravan_flight_reviews');
  const memoIns = countRows(memo.db, 'instructions');
  const trailFr = countRows(openTrail(), 'caravan_flight_reviews');
  const trailIns = countRows(trailOpened?.db ?? null, 'instructions');
  let frDb = null;
  let frSource = null;
  let residualTrail = null;
  if (memoFr + memoIns > 0) {
    frDb = memo.db;
    if (trailFr + trailIns > 0) {
      // 両在は移行未完了の異常。合算はしない（AVG 系の二重計上を避け、異常として見せる）
      frSource = 'both(migration incomplete)';
      residualTrail = { flightReviews: trailFr, instructions: trailIns };
    } else {
      frSource = 'trail-caravan-book';
    }
  } else if (trailFr + trailIns > 0) {
    frDb = trailOpened.db;
    frSource = 'trail(pre-migration)';
  } else if (hasTable(memo.db, 'caravan_flight_reviews')) {
    frDb = memo.db;
    frSource = 'trail-caravan-book(empty)';
  }
  if (frDb === null) {
    snapshot.flightRecord = null;
  } else {
    const outcomeRows = rows(
      q(frDb, `SELECT outcome, COUNT(*) c FROM caravan_flight_reviews
               WHERE ended_at >= datetime('now','-${WINDOW_DAYS} days') GROUP BY outcome`),
    );
    const outcomes = { achieved: 0, partial: 0, unachieved: 0, unknown: 0 };
    for (const r of outcomeRows) if (r.outcome in outcomes) outcomes[r.outcome] = r.c;
    const agg = one(
      q(frDb, `SELECT COUNT(*) total,
                 ROUND(AVG(rework_count), 2) avgRework,
                 SUM(tool_failure_count) failures, SUM(tool_call_count) calls,
                 SUM(CASE WHEN outcome_source != 'machine' THEN 1 ELSE 0 END) assessed,
                 SUM(CASE WHEN lesson_candidates != '[]' THEN 1 ELSE 0 END) lessonReviews,
                 SUM(CASE WHEN unresolved_items != '[]' THEN 1 ELSE 0 END) unresolvedReviews
               FROM caravan_flight_reviews WHERE ended_at >= datetime('now','-${WINDOW_DAYS} days')`),
    ) ?? {};
    const total = agg.total ?? 0;
    const instr = one(
      q(frDb, `SELECT
                 SUM(CASE WHEN started_at >= datetime('now','-${WINDOW_DAYS} days') THEN 1 ELSE 0 END) started30d,
                 SUM(CASE WHEN closed_at IS NOT NULL AND closed_at >= datetime('now','-${WINDOW_DAYS} days') THEN 1 ELSE 0 END) closed30d,
                 SUM(CASE WHEN closed_at IS NULL THEN 1 ELSE 0 END) openTotal,
                 SUM(CASE WHEN closed_at IS NULL AND started_at < datetime('now','-7 days') THEN 1 ELSE 0 END) openOver7d,
                 COUNT(*) declaredTotal
               FROM caravan_instructions`),
    ) ?? {};
    const sessionsPer = one(
      q(frDb, `SELECT ROUND(AVG(cnt), 1) avgSessions,
                 SUM(CASE WHEN cnt > 1 THEN 1 ELSE 0 END) multiSession
               FROM (SELECT COUNT(*) cnt FROM caravan_instruction_sessions GROUP BY instruction_id)`),
    ) ?? {};
    // 指示単位コスト: caravan_instruction_sessions(移設先) × trail.activity_session_costs(activity.db 残留)を
    // JS 側で突合する(ATTACH 非依存。読み先が trail 側でも同一コードで動く)。
    // 対象は直近 30 日に開始した指示のみ。
    let topInstructionsByCost = [];
    const links = rows(
      q(frDb, `SELECT s.instruction_id id, s.session_id sid, i.summary summary
               FROM caravan_instruction_sessions s JOIN caravan_instructions i ON i.id = s.instruction_id
               WHERE i.started_at >= datetime('now','-${WINDOW_DAYS} days')`),
    );
    const costDb = openTrail();
    if (links.length > 0 && costDb != null) {
      const ids = [...new Set(links.map((l) => l.sid))];
      const placeholders = ids.map(() => '?').join(', ');
      const costRows = rows(
        q(costDb, `SELECT session_id, SUM(estimated_cost_usd) c FROM activity_session_costs
                   WHERE session_id IN (${placeholders}) GROUP BY session_id`, ids),
      );
      const costBySession = new Map(costRows.map((r) => [r.session_id, r.c ?? 0]));
      const byInstruction = new Map();
      for (const l of links) {
        const entry = byInstruction.get(l.id) ?? { instructionId: l.id, summary: l.summary, sessions: 0, cost: 0 };
        entry.sessions += 1;
        entry.cost += costBySession.get(l.sid) ?? 0;
        byInstruction.set(l.id, entry);
      }
      topInstructionsByCost = [...byInstruction.values()]
        .map((e) => ({ ...e, cost: Math.round(e.cost * 100) / 100 }))
        .sort((a, b) => b.cost - a.cost)
        .slice(0, 5);
    }
    snapshot.flightRecord = {
      source: frSource,
      // 移行未完了（both）のとき trail 側に残っている行数。null は残存なし
      residualTrail,
      windowDays: WINDOW_DAYS,
      reviews30d: {
        total,
        outcomes,
        // 自己評価カバレッジ: machine のまま(unknown 固定)の行は成否を語れないため、
        // 未達成率は assessed(self/manual)を分母にする
        selfAssessedPct: pct(agg.assessed ?? 0, total),
        unachievedSharePct: pct((outcomes.unachieved ?? 0) + (outcomes.partial ?? 0), agg.assessed ?? 0),
        avgReworkCount: agg.avgRework ?? null,
        toolFailureRatePct: pct(agg.failures ?? 0, agg.calls ?? 0),
        lessonCandidateReviews: agg.lessonReviews ?? 0,
        unresolvedReviews: agg.unresolvedReviews ?? 0,
      },
      instructions: {
        started30d: instr.started30d ?? 0,
        closed30d: instr.closed30d ?? 0,
        openTotal: instr.openTotal ?? 0,
        openOver7d: instr.openOver7d ?? 0,
        declaredTotal: instr.declaredTotal ?? 0,
        avgSessionsPerInstruction: sessionsPer.avgSessions ?? null,
        multiSessionInstructions: sessionsPer.multiSession ?? 0,
      },
      topInstructionsByCost30d: topInstructionsByCost,
    };
  }
  if (memo.db) memo.db.close();
  if (trailOpened?.db) trailOpened.db.close();
}

// ── caravan-book.db / activity.db(未移行): 具体化観点の採掘(DCT-14) ────────────────
// 「指示から一意に定まらない論点」の事前申告と、その取りこぼしを集計する。
// 主材料は **申告が空なのに人が modified した判断**（一意に定まると言い切ったのに覆された）で、
// これが具体化観点(elaboration checklist)の昇格候補になる。申告できたもの(非空)は既に
// 運用が働いた記録なので、学ぶべきは取りこぼした側にある。
// 正本: <docsRoot>/proposal/20260807-elaboration-checklist.ja.md
{
  const hasTable = (db, name) =>
    db != null && rows(q(db, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [name])).length > 0;
  const countRows = (db, table) =>
    hasTable(db, table) ? Number(one(q(db, `SELECT COUNT(*) c FROM ${table}`))?.c ?? 0) : 0;
  const memo = open('caravan-book.db');
  if (memo.error) snapshot.errors.push(memo.error);
  const trailOpened = open('activity.db');
  if (trailOpened.error) snapshot.errors.push(trailOpened.error);
  // 読み先は flight record と同じく**行数**で選ぶ（空テーブルが常に作られるため実在判定では選べない）
  const memoCount = countRows(memo.db, 'caravan_doctrine_judgments');
  const trailCount = countRows(trailOpened.db, 'caravan_doctrine_judgments');
  const djDb = memoCount > 0 ? memo.db : trailCount > 0 ? trailOpened.db : hasTable(memo.db, 'caravan_doctrine_judgments') ? memo.db : null;
  const djSource = memoCount > 0 ? (trailCount > 0 ? 'both(migration incomplete)' : 'trail-caravan-book')
    : trailCount > 0 ? 'trail(pre-migration)'
      : djDb != null ? 'trail-caravan-book(empty)' : null;

  if (djDb === null) {
    snapshot.doctrineGap = null;
  } else if (!rows(q(djDb, `PRAGMA table_info(caravan_doctrine_judgments)`)).some((c) => c.name === 'underspecified_points_json')) {
    // DCT-14 未マイグレーション。0 件ではなく**測定不能**として出す
    snapshot.doctrineGap = { source: djSource, available: false, reason: 'underspecified_points_json 列が無い(DCT-14 未マイグレーション)' };
  } else {
    // DCT-14 以前の行は ALTER の DEFAULT で空の申告に確定しているため、生きた信号は導入日以降に絞る。
    // ここを全期間にすると指示不足率が構造的に低く出る（spec 16 §3.3 の注記と同じ理由）。
    const SINCE = '2026-08-07';
    const all = rows(
      q(djDb, `SELECT id, session_id, subject, agent_judgment, human_decision, judged_at, underspecified_points_json points
               FROM caravan_doctrine_judgments WHERE judged_at >= ? ORDER BY judged_at DESC`, [SINCE]),
    );
    // 申告の 3 状態。破損を空にも非空にも倒さない（[[metric-conflates-causes-with-different-remedies]]）
    const declarationOf = (raw) => {
      try {
        const v = JSON.parse(raw);
        if (!Array.isArray(v)) return { state: 'unreadable', points: [] };
        return { state: v.length > 0 ? 'declared' : 'empty', points: v };
      } catch {
        return { state: 'unreadable', points: [] };
      }
    };
    // 指示の型（決定論の近似。E-1/E-2/E-3 の分類は LLM が本文で精緻化する）
    const promptShape = (prompt) => {
      if (prompt == null) return 'undeclared';
      const t = String(prompt).trim();
      if (/[?？]\s*$/.test(t)) return 'question';
      if ([...t].length <= 15) return 'terse';
      return 'other';
    };
    // 指示の全文は同一 DB の instructions から引く（無ければ undeclared へ縮退）
    const promptBySession = new Map();
    if (hasTable(djDb, 'caravan_instruction_sessions') && hasTable(djDb, 'caravan_instructions')) {
      for (const r of rows(
        q(djDb, `SELECT s.session_id sid, i.origin_prompt prompt, i.summary summary
                 FROM caravan_instruction_sessions s JOIN caravan_instructions i ON i.id = s.instruction_id`),
      )) {
        promptBySession.set(r.sid, { prompt: r.prompt, summary: r.summary });
      }
    }
    const enriched = all.map((r) => {
      const d = declarationOf(r.points);
      const link = promptBySession.get(r.session_id) ?? null;
      return { ...r, state: d.state, points: d.points, originPrompt: link?.prompt ?? null, promptShape: promptShape(link?.prompt ?? null) };
    });
    // 取りこぼし: escalate 以外（＝自分で決めた）で、申告が空なのに人が修正した判断
    const missed = enriched.filter((r) => r.state === 'empty' && r.human_decision === 'modified' && r.agent_judgment !== 'escalate');
    const declared = enriched.filter((r) => r.state === 'declared');
    const unreadable = enriched.filter((r) => r.state === 'unreadable');
    const byShape = { terse: 0, question: 0, other: 0, undeclared: 0 };
    for (const r of missed) byShape[r.promptShape] += 1;
    const sample = (r) => ({
      subject: String(r.subject ?? '').slice(0, 100),
      judgedAt: r.judged_at,
      promptShape: r.promptShape,
      originPrompt: r.originPrompt == null ? null : String(r.originPrompt).replace(/\s+/g, ' ').slice(0, 120),
      points: r.points.map((p) => String(p).slice(0, 100)),
    });
    // ゲート理由分布（DCT-19 観測・proposal 20260815-ai-review-approval-intake）。
    // doctrine_silent / no_canon_citation の比率は canon 補完で削れる母集団、
    // underspecified_instruction は解消経路(resolve_underspecified_points)の利用状況を映す。
    // 全期間で数える（分布の前回比デルタを取るため。SINCE で切ると母数が薄く比率が暴れる）
    let gateVerdicts = null;
    let escalateReasons = null;
    if (rows(q(djDb, `PRAGMA table_info(caravan_doctrine_judgments)`)).some((c) => c.name === 'gate_reasons_json')) {
      gateVerdicts = { delegable: 0, escalate: 0 };
      escalateReasons = {};
      for (const r of rows(q(djDb, `SELECT gate_verdict verdict, gate_reasons_json reasons FROM caravan_doctrine_judgments WHERE gate_verdict IS NOT NULL`))) {
        gateVerdicts[r.verdict] = (gateVerdicts[r.verdict] ?? 0) + 1;
        if (r.verdict !== 'escalate') continue;
        let parsed = [];
        try {
          const v = JSON.parse(r.reasons);
          if (Array.isArray(v)) parsed = v;
        } catch (e) {
          // 破損は理由不明として数える（黙って落とすと分布の分母が verdict と合わなくなる）
          parsed = [`unreadable(${e instanceof Error ? e.message : 'parse error'})`.slice(0, 60)];
        }
        for (const reason of (parsed.length > 0 ? parsed : ['(no reason recorded)'])) {
          escalateReasons[reason] = (escalateReasons[reason] ?? 0) + 1;
        }
      }
    }
    snapshot.doctrineGap = {
      source: djSource,
      available: true,
      since: SINCE,
      total: enriched.length,
      declaredCount: declared.length,
      missedCount: missed.length,
      unreadableDeclarations: unreadable.length,
      // 申告できた割合。0 へ張り付くのは「代行したいから空で出す」形骸化のサイン
      instructionGapRatePct: pct(declared.length, enriched.length),
      // 昇格判定の突合キー。同じ shape が前回スナップショットにも在れば「2 回目」
      missedByPromptShape: byShape,
      missedSamples: missed.slice(0, 5).map(sample),
      declaredSamples: declared.slice(0, 5).map(sample),
      // ゲート理由分布（全期間。列未導入の旧 DB は null = 測定不能）
      gateVerdicts,
      escalateReasons,
    };
  }
  if (memo.db) memo.db.close();
  if (trailOpened.db) trailOpened.db.close();
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

    const { db, error } = open('activity.db');
    if (error) snapshot.errors.push(error);
    const usage = rows(
      q(db, `SELECT skill, COUNT(*) n FROM activity_messages
             WHERE skill IS NOT NULL AND skill != '' AND timestamp >= datetime('now','-30 days')
             GROUP BY skill ORDER BY n DESC`),
    );
    // 前 30 日窓(60〜30 日前)。版数バンプ(改訂)後に発火が減ったかを 2 窓比較で判定する材料
    // (proposal/20260716-prompt-feedback-loops)。判定自体は SKILL.md §2 のデルタ比較が行う。
    const usagePrev = rows(
      q(db, `SELECT skill, COUNT(*) n FROM activity_messages
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
      // activity.db 不開時は usage が空になり「全スキル未使用」と誤読されるため測定不能 null にする(brokenRefs と同原則)
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
        // 可逆な複合キー。単純連結だと区切り文字を含む値同士で別組が同一キーへ衝突する
        // （かつ NUL 区切りはファイル全体を grep のバイナリ判定に落とす前科がある）
        const k = JSON.stringify([p.category, p.model]);
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

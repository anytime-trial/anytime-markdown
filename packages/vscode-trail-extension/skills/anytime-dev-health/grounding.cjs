#!/usr/bin/env node
/**
 * anytime-dev-health: 決定論的 grounding。
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
const path = require('node:path');

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

const snapshot = { generatedAt: new Date().toISOString(), dbDir: DB_DIR, errors: [] };

// ── trail.db: コスト・活動・hotspot ────────────────────────────────────────────
{
  const { db, error } = open('trail.db');
  if (error) snapshot.errors.push(error);

  // コスト(モデル別)
  const cost = rows(q(db, `SELECT model, COUNT(*) sessions, ROUND(SUM(estimated_cost_usd),2) cost,
       SUM(cache_read_tokens) cache_read, SUM(input_tokens) input
     FROM session_costs GROUP BY model ORDER BY cost DESC`));
  const totalCost = cost.reduce((s, r) => s + (r.cost || 0), 0);
  const opus = cost.find((r) => /opus/i.test(r.model || ''));
  const totalCacheRead = cost.reduce((s, r) => s + (r.cache_read || 0), 0);
  const totalInput = cost.reduce((s, r) => s + (r.input || 0), 0);
  snapshot.cost = {
    byModel: cost.map((r) => ({ model: r.model, sessions: r.sessions, cost: r.cost })),
    totalCost: Math.round(totalCost * 100) / 100,
    opusCostSharePct: pct(opus ? opus.cost || 0 : 0, totalCost),
    cacheReadSharePct: pct(totalCacheRead, totalCacheRead + totalInput),
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

process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');

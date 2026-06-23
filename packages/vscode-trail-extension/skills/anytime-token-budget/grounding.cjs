#!/usr/bin/env node
/**
 * anytime-token-budget: 決定論的 grounding。
 *
 * Trail の trail.db を read-only で集計し、LLM コスト(token budget)の signals snapshot を
 * JSON で **stdout に出力** する。LLM 非依存・MCP 非依存(node:sqlite)なので headless
 * `claude -p` / cron でも完走する。
 *
 * 着眼(RC2): Opus メインの超長大セッションが /clear・/compact なしで継続し cache_read が
 * 「文脈サイズ×ターン数」で二乗膨張する。session_costs(per session×model・estimated_cost_usd)と
 * sessions(message_count / peak_context_tokens / compact_count 等)を突合し、
 * 「高コスト × compact 未使用」のセッション衛生を定量化する。
 *
 * 使い方:
 *   node grounding.cjs [dbDir]
 *   dbDir 省略時は <cwd>/.anytime/trail/db を探索。
 *
 * 出力はそのまま <docs>/report/_signals/token-budget/<YYYYMMDD>.json に保存しデルタ比較に使う。
 */
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

// 閾値(運用で調整可)。expensiveCostUsd を超える、または longSessionMsgs を超えるセッションを「重い」とみなす。
const EXPENSIVE_COST_USD = 20;
const LONG_SESSION_MSGS = 1000;
// 週次グルーピングは JST 境界(CLAUDE.md「集計の境界は JST」)。start_time は UTC ISO 保存のため +9h で寄せる。
// 週番号は ISO 8601(%G-%V)を使う。POSIX の %W は年初の部分週を W00 とし、年跨ぎで週が割れる/逆転するため。
const JST_OFFSET = '+9 hours';

function resolveDbDir() {
  // 解決順: 明示引数 → ワークスペース(cwd)相対。Trail は <workspace>/.anytime/trail/db に DB を置く。
  // 配布物として任意ユーザー環境で動くよう、開発機固有の絶対パスは持たない。
  const candidates = [process.argv[2], path.join(process.cwd(), '.anytime', 'trail', 'db')].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'trail.db'))) return c;
  }
  return candidates.at(-1) ?? path.join(process.cwd(), '.anytime', 'trail', 'db');
}

const DB_DIR = resolveDbDir();
const snapshot = { generatedAt: new Date().toISOString(), dbDir: DB_DIR, errors: [] };

function open(file) {
  const p = path.join(DB_DIR, file);
  try {
    return { db: new DatabaseSync(p, { readOnly: true }), error: null };
  } catch (e) {
    return { db: null, error: `open failed ${p}: ${e.message}` };
  }
}

/**
 * クエリの silent 失敗で誤った 0/[] を出さないため、失敗は snapshot.errors に記録する。
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
const num = (r, key, def = 0) => {
  const o = rows(r)[0] ?? null;
  return o && o[key] != null ? o[key] : def;
};
const round2 = (n) => Math.round((n || 0) * 100) / 100;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

{
  const { db, error } = open('trail.db');
  if (error) snapshot.errors.push(error);

  // ── モデル別コスト(session_costs が正準・estimated_cost_usd 算出済み) ──────────
  const byModel = rows(
    q(
      db,
      `SELECT model,
              COUNT(DISTINCT session_id) sessions,
              ROUND(SUM(estimated_cost_usd), 2) cost,
              SUM(cache_read_tokens) cache_read,
              SUM(output_tokens) output
       FROM session_costs
       GROUP BY model
       ORDER BY cost DESC`,
    ),
  ).map((r) => ({
    model: r.model,
    sessions: r.sessions,
    cost: r.cost || 0,
    cacheRead: r.cache_read || 0,
    output: r.output || 0,
  }));
  const totalCost = byModel.reduce((s, r) => s + r.cost, 0);
  const opusCost = byModel.filter((r) => /opus/i.test(r.model || '')).reduce((s, r) => s + r.cost, 0);
  const totalCacheRead = byModel.reduce((s, r) => s + r.cacheRead, 0);

  // ── セッション別コスト + メタ突合(高コスト×衛生) ──────────────────────────────
  const topSessions = rows(
    q(
      db,
      `SELECT sc.session_id,
              ROUND(SUM(sc.estimated_cost_usd), 2) cost,
              SUM(sc.cache_read_tokens) cache_read,
              s.message_count, s.peak_context_tokens, s.compact_count,
              s.sub_agent_count, s.git_branch, s.start_time, s.model
       FROM session_costs sc
       LEFT JOIN sessions s ON s.id = sc.session_id
       GROUP BY sc.session_id
       ORDER BY cost DESC
       LIMIT 15`,
    ),
  ).map((r) => {
    const msgs = r.message_count || 0;
    const compact = r.compact_count || 0;
    const noHygiene = (r.cost >= EXPENSIVE_COST_USD || msgs >= LONG_SESSION_MSGS) && compact === 0;
    return {
      session: (r.session_id || '').slice(0, 8),
      cost: r.cost || 0,
      cacheRead: r.cache_read || 0,
      messageCount: msgs,
      peakContextTokens: r.peak_context_tokens || 0,
      compactCount: compact,
      subAgentCount: r.sub_agent_count || 0,
      gitBranch: r.git_branch || null,
      startTime: r.start_time || null,
      model: r.model || null,
      hygieneFlag: noHygiene ? 'expensive-no-compact' : null,
    };
  });
  const opusCacheRead = byModel
    .filter((r) => /opus/i.test(r.model || ''))
    .reduce((s, r) => s + r.cacheRead, 0);
  const top15Cost = topSessions.reduce((s, r) => s + r.cost, 0);

  // ── 衛生サマリ(高コスト/超長大 × compact 未使用) ──────────────────────────────
  const expensiveSessions = num(
    q(
      db,
      `SELECT COUNT(*) c FROM (
         SELECT sc.session_id, SUM(sc.estimated_cost_usd) cost
         FROM session_costs sc GROUP BY sc.session_id HAVING cost >= ?)`,
      [EXPENSIVE_COST_USD],
    ),
    'c',
  );
  const expensiveNoCompact = num(
    q(
      db,
      `SELECT COUNT(*) c FROM (
         SELECT sc.session_id, SUM(sc.estimated_cost_usd) cost, s.compact_count
         FROM session_costs sc LEFT JOIN sessions s ON s.id = sc.session_id
         GROUP BY sc.session_id HAVING cost >= ?)
       WHERE COALESCE(compact_count, 0) = 0`,
      [EXPENSIVE_COST_USD],
    ),
    'c',
  );
  const longSessions = num(
    q(db, 'SELECT COUNT(*) c FROM sessions WHERE message_count >= ?', [LONG_SESSION_MSGS]),
    'c',
  );
  const longNoCompact = num(
    q(
      db,
      'SELECT COUNT(*) c FROM sessions WHERE message_count >= ? AND COALESCE(compact_count, 0) = 0',
      [LONG_SESSION_MSGS],
    ),
    'c',
  );

  // ── 週次トレンド(JST 境界) + 直近 7d / 前 7d ──────────────────────────────────
  const weekly = rows(
    q(
      db,
      `SELECT strftime('%G-W%V', datetime(s.start_time, ?)) week,
              ROUND(SUM(sc.estimated_cost_usd), 2) cost,
              COUNT(DISTINCT sc.session_id) sessions
       FROM session_costs sc JOIN sessions s ON s.id = sc.session_id
       WHERE s.start_time IS NOT NULL AND s.start_time != ''
       GROUP BY week ORDER BY week DESC LIMIT 8`,
      [JST_OFFSET],
    ),
  ).map((r) => ({ week: r.week, cost: r.cost || 0, sessions: r.sessions }));
  const last7dCost = round2(
    num(
      q(
        db,
        `SELECT SUM(sc.estimated_cost_usd) c FROM session_costs sc JOIN sessions s ON s.id = sc.session_id
         WHERE s.start_time >= datetime('now', '-7 days')`,
      ),
      'c',
    ),
  );
  const prior7dCost = round2(
    num(
      q(
        db,
        `SELECT SUM(sc.estimated_cost_usd) c FROM session_costs sc JOIN sessions s ON s.id = sc.session_id
         WHERE s.start_time >= datetime('now', '-14 days') AND s.start_time < datetime('now', '-7 days')`,
      ),
      'c',
    ),
  );

  snapshot.totals = {
    totalCostUsd: round2(totalCost),
    opusCostUsd: round2(opusCost),
    opusCostSharePct: pct(opusCost, totalCost),
    totalCacheReadTokens: totalCacheRead,
    opusCacheReadSharePct: pct(opusCacheRead, totalCacheRead),
    top15SessionsCostSharePct: pct(top15Cost, totalCost),
    expensiveCostUsdThreshold: EXPENSIVE_COST_USD,
    longSessionMsgsThreshold: LONG_SESSION_MSGS,
  };
  snapshot.byModel = byModel;
  snapshot.topSessions = topSessions;
  snapshot.hygiene = {
    expensiveSessions,
    expensiveNoCompact,
    longSessions,
    longNoCompact,
  };
  snapshot.trend = { last7dCost, prior7dCost, weekly };

  if (db) db.close();
}

process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');

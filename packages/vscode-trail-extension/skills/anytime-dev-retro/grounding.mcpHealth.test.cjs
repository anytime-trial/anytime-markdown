/**
 * mcpHealth（MCP サーバーの利用消失）のリグレッション。
 *
 * 由来: 2026-08-19 の devcontainer 再構築で user スコープの Serena 登録が消え、
 * 1 か月以上どのセッションにも接続されないまま気づかれなかった（2026-09-26 調査）。
 * 要件は「消失を拾うこと」と同じだけ「誤警報を出さないこと」で、次の境界を固定する。
 * - ツール名は json_each で突合する（Bash コマンド本文に "mcp__serena__" が書かれた行を数えない）
 * - 呼出はワークスペース配下（cwd 前方一致）に限る（activity.db は全ワークスペースを取込む）
 * - disabledMcpjsonServers は意図的な無効化で silent / vanished に入れない
 * - .mcp.json 不在は null（0 サーバーと区別する）
 */
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function runGrounding(setup, env = {}) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'grounding-mcp-'));
  try {
    setup(ws);
    const r = spawnSync(process.execPath, [path.join(__dirname, 'grounding.cjs')], {
      cwd: ws,
      encoding: 'utf-8',
      timeout: 60000,
      env: { ...process.env, ...env },
    });
    expect(r.status).toBe(0);
    return { ws, snap: JSON.parse(r.stdout) };
  } finally {
    fs.rmSync(ws, { recursive: true, force: true });
  }
}

function seedActivity(ws, rows) {
  const dir = path.join(ws, '.anytime', 'trail', 'db');
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, 'activity.db'));
  db.exec(`CREATE TABLE activity_messages (
    uuid TEXT PRIMARY KEY, session_id TEXT, type TEXT, tool_calls TEXT,
    timestamp TEXT, is_sidechain INTEGER DEFAULT 0, cwd TEXT
  )`);
  const ins = db.prepare('INSERT INTO activity_messages VALUES (?,?,?,?,?,0,?)');
  const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
  rows.forEach((r, i) => ins.run(`u${i}`, 's1', 'assistant', r.toolCalls, daysAgo(r.daysAgo), r.cwd ?? ws));
  db.close();
}

const call = (name, input = {}) => JSON.stringify([{ id: 'toolu_x', name, input }]);

function writeMcpJson(ws, servers, disabled = []) {
  fs.writeFileSync(
    path.join(ws, '.mcp.json'),
    JSON.stringify({ mcpServers: Object.fromEntries(servers.map((s) => [s, { command: 'npx' }])) }),
  );
  fs.mkdirSync(path.join(ws, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(ws, '.claude', 'settings.local.json'), JSON.stringify({ disabledMcpjsonServers: disabled }));
}

describe('mcpHealth（MCP サーバーの利用消失）', () => {
  it('編集があるのに 30 日呼出ゼロで、前 30 日には呼出があったサーバーを vanished に出す', () => {
    const { snap } = runGrounding((ws) => {
      writeMcpJson(ws, ['serena', 'mcp-trail']);
      seedActivity(ws, [
        { toolCalls: call('Edit', { file_path: 'a.ts' }), daysAgo: 3 },
        { toolCalls: call('mcp__mcp-trail__query_code_graph'), daysAgo: 5 },
        { toolCalls: call('mcp__serena__find_symbol'), daysAgo: 45 },
      ]);
    });
    expect(snap.mcpHealth.editTurns30d).toBe(1);
    expect(snap.mcpHealth.servers).toEqual([
      { name: 'serena', calls30d: 0, prev30: 1 },
      { name: 'mcp-trail', calls30d: 1, prev30: 0 },
    ]);
    expect(snap.mcpHealth.silent30d).toEqual(['serena']);
    expect(snap.mcpHealth.vanished30d).toEqual(['serena']);
  });

  it('Bash コマンド本文に書かれたツール名文字列と、別ワークスペースの呼出は数えない', () => {
    const { snap } = runGrounding((ws) => {
      writeMcpJson(ws, ['serena']);
      seedActivity(ws, [
        { toolCalls: call('Edit', { file_path: 'a.ts' }), daysAgo: 3 },
        // 調査スクリプトが "mcp__serena__" を grep しただけの行（誤検知の実例 2026-09-26）
        { toolCalls: call('Bash', { command: "grep -c '\"name\":\"mcp__serena__' log.jsonl" }), daysAgo: 2 },
        // 別ワークスペース（activity.db は全ワークスペースを取込む）
        { toolCalls: call('mcp__serena__find_symbol'), daysAgo: 2, cwd: '/other-workspace' },
      ]);
    });
    expect(snap.mcpHealth.servers).toEqual([{ name: 'serena', calls30d: 0, prev30: 0 }]);
    expect(snap.mcpHealth.silent30d).toEqual(['serena']);
    // 前 30 日にも呼出が無いので「消えた」ではなく「使われていない」
    expect(snap.mcpHealth.vanished30d).toEqual([]);
  });

  it('disabledMcpjsonServers のサーバーは意図的な無効化として対象外にする', () => {
    const { snap } = runGrounding((ws) => {
      writeMcpJson(ws, ['mcp-graph', 'serena'], ['mcp-graph']);
      seedActivity(ws, [{ toolCalls: call('Edit', { file_path: 'a.ts' }), daysAgo: 1 }]);
    });
    expect(snap.mcpHealth.declared).toBe(2);
    expect(snap.mcpHealth.disabled).toEqual(['mcp-graph']);
    expect(snap.mcpHealth.servers.map((s) => s.name)).toEqual(['serena']);
    expect(snap.mcpHealth.silent30d).toEqual(['serena']);
  });

  it('編集が無い窓では silent を出さない（活動が無いだけで規約は形骸化していない）', () => {
    const { snap } = runGrounding((ws) => {
      writeMcpJson(ws, ['serena']);
      seedActivity(ws, []);
    });
    expect(snap.mcpHealth.editTurns30d).toBe(0);
    expect(snap.mcpHealth.silent30d).toEqual([]);
  });

  it('.mcp.json が無いワークスペースでは null（0 サーバーと区別する）', () => {
    const { snap } = runGrounding((ws) => {
      seedActivity(ws, []);
    });
    expect(snap.mcpHealth).toBeNull();
  });
});

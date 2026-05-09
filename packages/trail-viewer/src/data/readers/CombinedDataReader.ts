import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CombinedData,
  CombinedPeriodMode,
  CombinedRangeDays,
  ToolMetrics,
} from '../../domain/parser/types';

export class CombinedDataReader {
  constructor(private readonly client: SupabaseClient) {}

  async getSessionToolMetrics(sessionId: string): Promise<ToolMetrics | null> {
    const { data, error } = await this.client
      .from('trail_messages')
      .select('tool_calls')
      .eq('session_id', sessionId)
      .not('tool_calls', 'is', null);
    if (error) return null;

    let totalRetries = 0;
    let totalEdits = 0;
    let totalBuildRuns = 0;
    let totalBuildFails = 0;
    let totalTestRuns = 0;
    let totalTestFails = 0;

    for (const row of data ?? []) {
      if (!row.tool_calls) continue;
      try {
        const calls = JSON.parse(row.tool_calls) as readonly { name?: string; error?: boolean }[];
        for (const call of calls) {
          const name = call.name ?? '';
          if (name === 'Retry') totalRetries++;
          if (name === 'Edit' || name === 'Write') totalEdits++;
          if (name === 'Bash' && totalBuildRuns >= 0) {
            // Approximation — count build/test by name heuristic
          }
          if (name.toLowerCase().includes('build')) {
            totalBuildRuns++;
            if (call.error) totalBuildFails++;
          }
          if (name.toLowerCase().includes('test')) {
            totalTestRuns++;
            if (call.error) totalTestFails++;
          }
        }
      } catch (parseError) {
        console.warn('CombinedDataReader.getSessionToolMetrics: failed to parse tool_calls', {
          context: { sessionId, length: row.tool_calls?.length ?? 0 },
          error: parseError instanceof Error
            ? { message: parseError.message, stack: parseError.stack }
            : { value: String(parseError) },
        });
      }
    }

    // ツール別利用統計を message_tool_calls + messages から集計
    const normalizeTool = (name: string): string => {
      if (!name.startsWith('mcp__')) return name;
      const parts = name.split('__');
      return parts.length >= 3 ? `${parts[0]}__${parts[1]}` : name;
    };
    const { data: tcData } = await this.client
      .from('trail_message_tool_calls')
      .select('message_uuid, turn_index, tool_name, skill_name, is_error, turn_exec_ms, model')
      .eq('session_id', sessionId);
    const tcRows = (tcData ?? []) as { message_uuid: string; turn_index: number; tool_name: string; skill_name: string | null; is_error: number; turn_exec_ms: number | null; model: string | null }[];

    // メッセージのトークン数を取得
    const msgUuids = [...new Set(tcRows.map(r => r.message_uuid))];
    const msgTokenMap = new Map<string, number>();
    const msgToolCount = new Map<string, number>();
    for (const r of tcRows) {
      msgToolCount.set(r.message_uuid, (msgToolCount.get(r.message_uuid) ?? 0) + 1);
    }
    for (let i = 0; i < msgUuids.length; i += 1000) {
      const batch = msgUuids.slice(i, i + 1000);
      const { data: msgData } = await this.client
        .from('trail_messages')
        .select('uuid, input_tokens, output_tokens')
        .in('uuid', batch);
      if (msgData) {
        for (const m of msgData as { uuid: string; input_tokens: number; output_tokens: number }[]) {
          msgTokenMap.set(m.uuid, (m.input_tokens ?? 0) + (m.output_tokens ?? 0));
        }
      }
    }
    // ターン内ツール数
    const turnToolCount = new Map<string, number>();
    for (const r of tcRows) {
      const tk = `${sessionId}:${r.turn_index}`;
      turnToolCount.set(tk, (turnToolCount.get(tk) ?? 0) + 1);
    }
    const toolAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const r of tcRows) {
      const tool = normalizeTool(r.tool_name);
      const e = toolAgg.get(tool) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      const mTokens = msgTokenMap.get(r.message_uuid) ?? 0;
      const mTools = msgToolCount.get(r.message_uuid) ?? 1;
      e.tokens += Math.round(mTokens / mTools);
      const tk = `${sessionId}:${r.turn_index}`;
      const tTools = turnToolCount.get(tk) ?? 1;
      e.durationMs += Math.round((r.turn_exec_ms ?? 0) / tTools);
      toolAgg.set(tool, e);
    }
    const toolUsage = [...toolAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([tool, e]) => ({ tool, ...e }));

    // スキル別利用統計
    const skillAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const r of tcRows) {
      if (!r.skill_name) continue;
      const skill = r.skill_name;
      const e = skillAgg.get(skill) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      const mTokens = msgTokenMap.get(r.message_uuid) ?? 0;
      const mTools = msgToolCount.get(r.message_uuid) ?? 1;
      e.tokens += Math.round(mTokens / mTools);
      const tk = `${sessionId}:${r.turn_index}`;
      const tTools = turnToolCount.get(tk) ?? 1;
      e.durationMs += Math.round((r.turn_exec_ms ?? 0) / tTools);
      skillAgg.set(skill, e);
    }
    const skillUsage = [...skillAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([skill, e]) => ({ skill, ...e }));

    // ツール別エラー回数（MCP 正規化）
    const errorAgg = new Map<string, number>();
    for (const r of tcRows) {
      if (!r.is_error) continue;
      const tool = normalizeTool(r.tool_name);
      errorAgg.set(tool, (errorAgg.get(tool) ?? 0) + 1);
    }
    const errorsByTool = [...errorAgg.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([tool, count]) => ({ tool, count }));

    // モデル別利用統計: count/tokens は assistant メッセージから、durationMs は turn_exec_ms をターン単位で集計
    const { data: modelMsgData } = await this.client
      .from('trail_messages')
      .select('uuid, model, input_tokens, output_tokens')
      .eq('session_id', sessionId)
      .eq('type', 'assistant')
      .not('model', 'is', null);
    const modelAgg = new Map<string, { count: number; tokens: number; durationMs: number }>();
    for (const m of (modelMsgData ?? []) as { uuid: string; model: string | null; input_tokens: number | null; output_tokens: number | null }[]) {
      if (!m.model) continue;
      const e = modelAgg.get(m.model) ?? { count: 0, tokens: 0, durationMs: 0 };
      e.count++;
      e.tokens += (m.input_tokens ?? 0) + (m.output_tokens ?? 0);
      modelAgg.set(m.model, e);
    }
    // turn_exec_ms はターン内全行で同一値。turn_index 単位で一度だけ加算する。
    const turnSeen = new Set<number>();
    for (const r of tcRows) {
      if (turnSeen.has(r.turn_index)) continue;
      turnSeen.add(r.turn_index);
      if (!r.model) continue;
      const e = modelAgg.get(r.model);
      if (e) e.durationMs += r.turn_exec_ms ?? 0;
    }
    const modelUsage = [...modelAgg.entries()]
      .sort(([, a], [, b]) => b.count - a.count)
      .map(([model, e]) => ({ model, ...e }));

    return { totalRetries, totalEdits, totalBuildRuns, totalBuildFails, totalTestRuns, totalTestFails, toolUsage, skillUsage, errorsByTool, modelUsage };
  }

  async getDayToolMetrics(date: string): Promise<ToolMetrics | null> {
    // Convert JST date to UTC range for trail_sessions.start_time (UTC ISO 8601)
    const jstDayStartUtc = new Date(`${date}T00:00:00+09:00`).toISOString();
    const jstDayEndUtc = new Date(`${date}T23:59:59.999+09:00`).toISOString();

    const [dailyResult, sessionResult] = await Promise.all([
      this.client
        .from('trail_daily_counts')
        .select('kind,key,count,tokens,duration_ms')
        .eq('date', date)
        .in('kind', ['tool', 'skill', 'error', 'model']),
      this.client
        .from('trail_sessions')
        .select('id')
        .gte('start_time', jstDayStartUtc)
        .lte('start_time', jstDayEndUtc),
    ]);

    if (dailyResult.error || !dailyResult.data) return null;

    type Row = { kind: string; key: string; count: number; tokens: number; duration_ms: number };
    const toolMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
    const skillMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
    const errMap = new Map<string, number>();
    const modelMap = new Map<string, { count: number; tokens: number; durationMs: number }>();

    for (const r of dailyResult.data as Row[]) {
      if (r.kind === 'tool') {
        const e = toolMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        toolMap.set(r.key, e);
      } else if (r.kind === 'skill') {
        const e = skillMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        skillMap.set(r.key, e);
      } else if (r.kind === 'error') {
        errMap.set(r.key, (errMap.get(r.key) ?? 0) + r.count);
      } else if (r.kind === 'model') {
        const e = modelMap.get(r.key) ?? { count: 0, tokens: 0, durationMs: 0 };
        e.count += r.count; e.tokens += r.tokens; e.durationMs += r.duration_ms;
        modelMap.set(r.key, e);
      }
    }

    // Compute retry/build/test metrics from message_tool_calls for the day's sessions
    let totalEdits = 0;
    let totalRetries = 0;
    let totalBuildRuns = 0;
    let totalBuildFails = 0;
    let totalTestRuns = 0;
    let totalTestFails = 0;

    const sessionIds = (sessionResult.data ?? []).map((s: { id: string }) => s.id);
    if (sessionIds.length > 0) {
      type TcRow = { session_id: string; tool_name: string; file_path: string | null; command: string | null; is_error: number };
      const BUILD_RE = /npm run build|npx tsc|\btsc\b|webpack|vite build|esbuild|rollup/;
      const TEST_RE = /jest|vitest|npm run test|npm test/;
      const editFileMap = new Map<string, number>();

      const BATCH = 200;
      for (let i = 0; i < sessionIds.length; i += BATCH) {
        const batch = sessionIds.slice(i, i + BATCH);
        for (let offset = 0; ; offset += 1000) {
          const { data: td } = await this.client
            .from('trail_message_tool_calls')
            .select('session_id,tool_name,file_path,command,is_error')
            .in('session_id', batch)
            .range(offset, offset + 999);
          if (!td || td.length === 0) break;
          for (const r of td as TcRow[]) {
            if (r.tool_name === 'Edit' || r.tool_name === 'Write') {
              totalEdits++;
              if (r.file_path) {
                const key = `${r.session_id}:${r.file_path}`;
                editFileMap.set(key, (editFileMap.get(key) ?? 0) + 1);
              }
            } else if (r.tool_name === 'Bash' && r.command) {
              if (BUILD_RE.test(r.command)) {
                totalBuildRuns++;
                if (r.is_error) totalBuildFails++;
              } else if (TEST_RE.test(r.command)) {
                totalTestRuns++;
                if (r.is_error) totalTestFails++;
              }
            }
          }
          if (td.length < 1000) break;
        }
      }
      for (const count of editFileMap.values()) {
        if (count > 1) totalRetries += count - 1;
      }
    }

    return {
      totalRetries, totalEdits, totalBuildRuns, totalBuildFails,
      totalTestRuns, totalTestFails,
      toolUsage: [...toolMap.entries()].map(([tool, e]) => ({ tool, ...e })).sort((a, b) => b.count - a.count),
      skillUsage: [...skillMap.entries()].map(([skill, e]) => ({ skill, ...e })).sort((a, b) => b.count - a.count),
      errorsByTool: [...errMap.entries()].map(([tool, count]) => ({ tool, count })).sort((a, b) => b.count - a.count),
      modelUsage: [...modelMap.entries()].map(([model, e]) => ({ model, ...e })).sort((a, b) => b.count - a.count),
    };
  }

  async getCombinedData(period: CombinedPeriodMode, rangeDays: CombinedRangeDays): Promise<CombinedData | null> {
    try {
      // daily_counts の date は JST (YYYY-MM-DD)。
      // cutoff も JST 日付文字列で比較する。
      const getIanaOffsetMs = (timeZone: string, at: Date): number => {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
        const label = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
        const match = /^GMT([+-])(\d{1,2}):(\d{2})$/.exec(label);
        if (!match) return 0;
        const sign = match[1] === '+' ? 1 : -1;
        return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000;
      };
      const cutoffMs = Date.now() - rangeDays * 86_400_000;
      const cutoffIso = new Date(cutoffMs).toISOString();
      const cutoffLocal = new Date(cutoffMs + getIanaOffsetMs('Asia/Tokyo', new Date(cutoffMs)));
      const cutoffDate = `${cutoffLocal.getUTCFullYear()}-${String(cutoffLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(cutoffLocal.getUTCDate()).padStart(2, '0')}`;

      type DcRow = { date: string; kind: string; key: string; count: number; tokens: number; duration_ms: number };
      type SessionRow = { id: string; source: string | null; start_time?: string | null; repo_name?: string | null };
      type CostRow = { session_id: string; input_tokens: number | null; output_tokens: number | null; cache_read_tokens: number | null; cache_creation_tokens: number | null; estimated_cost_usd: number | null };
      type CommitChartRow = {
        session_id: string;
        repo_name: string | null;
        commit_hash: string;
        commit_message?: string | null;
        subject?: string | null;
        committed_at: string;
        lines_added: number | null;
      };

      const fetchDailyCounts = async (): Promise<DcRow[]> => {
        const rows: DcRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await this.client
            .from('trail_daily_counts')
            .select('date,kind,key,count,tokens,duration_ms')
            .in('kind', ['skill', 'error', 'tool', 'model'])
            .gte('date', cutoffDate)
            .range(offset, offset + 999);
          if (error || !data || data.length === 0) break;
          rows.push(...(data as DcRow[]));
          if (data.length < 1000) break;
        }
        return rows;
      };
      const fetchSessions = async (): Promise<SessionRow[]> => {
        const rows: SessionRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await this.client
            .from('trail_sessions')
            .select('id,source,start_time,repo_name')
            .gte('start_time', cutoffIso)
            .range(offset, offset + 999);
          if (error || !data || data.length === 0) break;
          rows.push(...(data as SessionRow[]));
          if (data.length < 1000) break;
        }
        return rows;
      };
      const fetchSessionCosts = async (): Promise<CostRow[]> => {
        const rows: CostRow[] = [];
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await this.client
            .from('trail_session_costs')
            .select('session_id,input_tokens,output_tokens,cache_read_tokens,cache_creation_tokens,estimated_cost_usd')
            .range(offset, offset + 999);
          if (error || !data || data.length === 0) break;
          rows.push(...(data as CostRow[]));
          if (data.length < 1000) break;
        }
        return rows;
      };
      // session_commits は agent.loc 集計と prefix/repo 集計の両方で使う列を 1 回で取得し、
      // 元実装の 2 重 fetch (Loop 4 + Loop 5) を 1 回に統合する。
      const fetchSessionCommits = async (): Promise<CommitChartRow[]> => {
        const rows: CommitChartRow[] = [];
        let column: 'commit_message' | 'subject' = 'commit_message';
        for (let offset = 0; ; offset += 1000) {
          let { data, error } = await this.client
            .from('trail_session_commits')
            .select(`session_id,repo_name,commit_hash,${column},committed_at,lines_added`)
            .gte('committed_at', cutoffIso)
            .order('committed_at', { ascending: true })
            .range(offset, offset + 999);
          if (error && column === 'commit_message') {
            column = 'subject';
            const fallback = await this.client
              .from('trail_session_commits')
              .select('session_id,repo_name,commit_hash,subject,committed_at,lines_added')
              .gte('committed_at', cutoffIso)
              .order('committed_at', { ascending: true })
              .range(offset, offset + 999);
            data = fallback.data;
            error = fallback.error;
          }
          if (error || !data || data.length === 0) break;
          rows.push(...(data as CommitChartRow[]));
          if (data.length < 1000) break;
        }
        return rows;
      };

      // === Phase A: daily_counts と sessions を並列取得 ===
      const [allDcRows, allSessionRows] = await Promise.all([fetchDailyCounts(), fetchSessions()]);

      const getMonday = (dateStr: string): string => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dt = new Date(Date.UTC(y!, m! - 1, d!));
        const diffToMonday = (dt.getUTCDay() + 6) % 7;
        const monday = new Date(dt.getTime() - diffToMonday * 86_400_000);
        return `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}`;
      };
      const periodKey = (dateStr: string): string =>
        period === 'week' ? getMonday(dateStr) : dateStr;
      const toJSTDate = (isoStr: string): string => {
        const ms = new Date(isoStr).getTime();
        const jstMs = ms + getIanaOffsetMs('Asia/Tokyo', new Date(ms));
        const d = new Date(jstMs);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      };
      const normalizeTool = (name: string): string => {
        if (!name.startsWith('mcp__')) return name;
        const parts = name.split('__');
        return parts.length >= 3 ? `${parts[0]}__${parts[1]}` : name;
      };

      const errMap = new Map<string, { err: number; total: number; byTool: Record<string, number> }>();
      const skillMap = new Map<string, number>();
      // tool: key = `${periodKey}|${toolName}`, value = { count, tokens, durationMs }
      const toolDcMap = new Map<string, { count: number; tokens: number; durationMs: number }>();
      // model: key = `${periodKey}::${modelName}`, value = { count, tokens }
      const modelDcMap = new Map<string, { count: number; tokens: number }>();

      for (const r of allDcRows) {
        const p = periodKey(r.date);
        if (r.kind === 'error') {
          const ef = errMap.get(p) ?? { err: 0, total: 0, byTool: {} };
          ef.err += r.count;
          ef.byTool[r.key] = (ef.byTool[r.key] ?? 0) + r.count;
          errMap.set(p, ef);
        } else if (r.kind === 'skill') {
          const k = `${p}::${r.key}`;
          skillMap.set(k, (skillMap.get(k) ?? 0) + r.count);
        } else if (r.kind === 'tool') {
          const k = `${p}|${normalizeTool(r.key)}`;
          const cur = toolDcMap.get(k) ?? { count: 0, tokens: 0, durationMs: 0 };
          cur.count += r.count;
          cur.tokens += r.tokens ?? 0;
          cur.durationMs += r.duration_ms ?? 0;
          toolDcMap.set(k, cur);
        } else if (r.kind === 'model') {
          const k = `${p}::${r.key}`;
          const cur = modelDcMap.get(k) ?? { count: 0, tokens: 0 };
          cur.count += r.count;
          cur.tokens += r.tokens ?? 0;
          modelDcMap.set(k, cur);
        }
      }

      // Populate errMap.total from tool daily_counts
      for (const [k, e] of toolDcMap.entries()) {
        const p = k.slice(0, k.indexOf('|'));
        const ef = errMap.get(p) ?? { err: 0, total: 0, byTool: {} };
        ef.total += e.count;
        errMap.set(p, ef);
      }

      const splitKey = (k: string): [string, string] => {
        const sep = k.indexOf('::');
        return [k.slice(0, sep), k.slice(sep + 2)];
      };

      const errorRate = [...errMap.entries()]
        .filter(([, e]) => e.total > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([p, e]) => ({ period: p, rate: e.err / e.total, byTool: e.byTool }));

      const skillStats = [...skillMap.entries()]
        .map(([k, count]) => { const [p, skill] = splitKey(k); return { period: p, skill, count, costUsd: 0 }; })
        .sort((a, b) => a.period.localeCompare(b.period));

      const sourceBySessionId = new Map<string, string>();
      const sessionStartById = new Map<string, string>();
      const repoNameById = new Map<string, string>();
      for (const s of allSessionRows) {
        const source = s.source === 'codex' ? 'Codex' : 'Claude Code';
        sourceBySessionId.set(s.id, source);
        if (s.start_time) sessionStartById.set(s.id, s.start_time);
        if (s.repo_name) repoNameById.set(s.id, s.repo_name);
      }

      // === Phase B: session_costs と session_commits を並列取得 ===
      const [allCostRows, allCommitRows] = await Promise.all([fetchSessionCosts(), fetchSessionCommits()]);

      const repoTokenMap = new Map<string, number>();
      const agentMap = new Map<string, { tokens: number; costUsd: number; loc: number }>();
      const addAgent = (periodKeyStr: string, agent: string, delta: Partial<{ tokens: number; costUsd: number; loc: number }>) => {
        const k = `${periodKeyStr}::${agent}`;
        const cur = agentMap.get(k) ?? { tokens: 0, costUsd: 0, loc: 0 };
        cur.tokens += delta.tokens ?? 0;
        cur.costUsd += delta.costUsd ?? 0;
        cur.loc += delta.loc ?? 0;
        agentMap.set(k, cur);
      };

      for (const c of allCostRows) {
        const agent = sourceBySessionId.get(c.session_id);
        if (!agent) continue;
        const start = sessionStartById.get(c.session_id);
        if (!start) continue;
        const p = periodKey(toJSTDate(start));
        const tokens = (c.input_tokens ?? 0) + (c.output_tokens ?? 0) + (c.cache_read_tokens ?? 0) + (c.cache_creation_tokens ?? 0);
        addAgent(p, agent, { tokens, costUsd: c.estimated_cost_usd ?? 0 });
        const repoName = repoNameById.get(c.session_id);
        if (repoName) {
          const rk = `${p}::${repoName}`;
          repoTokenMap.set(rk, (repoTokenMap.get(rk) ?? 0) + tokens);
        }
      }

      const toolCounts = [...toolDcMap.entries()].map(([k, e]) => {
        const sep = k.indexOf('|');
        return {
          period: k.slice(0, sep),
          tool: k.slice(sep + 1),
          count: e.count,
          tokens: e.tokens,
          durationMs: e.durationMs,
          tokenMissingRate: 0,
          tokenTotalTurns: 0,
          tokenMissingTurns: 0,
        };
      }).sort((a, b) => a.period.localeCompare(b.period) || b.count - a.count);

      const agentStats = [...agentMap.entries()]
        .map(([k, v]) => {
          const [p, agent] = splitKey(k);
          return {
            period: p,
            agent,
            tokens: v.tokens,
            costUsd: v.costUsd,
            loc: v.loc,
            tokenMissingRate: 0,
            tokenTotalTurns: 0,
            tokenMissingTurns: 0,
          };
        })
        .sort((a, b) => a.period.localeCompare(b.period) || a.agent.localeCompare(b.agent));

      const modelStats = [...modelDcMap.entries()].map(([k, v]) => {
        const sep = k.indexOf('::');
        return {
          period: k.slice(0, sep),
          model: k.slice(sep + 2),
          count: v.count,
          tokens: v.tokens,
          tokenMissingRate: 0,
          tokenTotalTurns: 0,
          tokenMissingTurns: 0,
        };
      }).sort((a, b) => a.period.localeCompare(b.period) || b.count - a.count);

      const extractPrefix = (subject: string): string => {
        const m = /^([a-z]+)(?:\([^)]*\))?!?:\s/i.exec(subject);
        return m ? m[1].toLowerCase() : 'other';
      };
      const seenHashes = new Set<string>();
      const prefixMap = new Map<string, { count: number; linesAdded: number }>();
      const repoCommitCountMap = new Map<string, number>();
      // 旧実装は session_commits を 2 度フェッチしていた (Loop 4: agent.loc, Loop 5: prefix/repo)。
      // 同じ条件・同じテーブルなので allCommitRows 1 回の取得から両者を導出する。
      for (const c of allCommitRows) {
        const agent = sourceBySessionId.get(c.session_id);
        if (agent) {
          const p = periodKey(toJSTDate(c.committed_at));
          addAgent(p, agent, { loc: c.lines_added ?? 0 });
        }
        const identity = `${c.repo_name ?? ''}:${c.commit_hash}`;
        if (seenHashes.has(identity)) continue;
        seenHashes.add(identity);
        const repoForCommit = c.repo_name?.trim();
        if (repoForCommit) {
          const rck = `${periodKey(toJSTDate(c.committed_at))}::${repoForCommit}`;
          repoCommitCountMap.set(rck, (repoCommitCountMap.get(rck) ?? 0) + 1);
        }
        const subject = (c.commit_message ?? c.subject ?? '').split('\n')[0];
        const prefix = extractPrefix(subject);
        const p = periodKey(toJSTDate(c.committed_at));
        const commitKey = `${p}::${prefix}`;
        const e = prefixMap.get(commitKey) ?? { count: 0, linesAdded: 0 };
        e.count++;
        e.linesAdded += c.lines_added ?? 0;
        prefixMap.set(commitKey, e);
      }

      const commitPrefixStats = [...prefixMap.entries()]
        .map(([k, e]) => { const [p, prefix] = splitKey(k); return { period: p, prefix, count: e.count, linesAdded: e.linesAdded }; })
        .sort((a, b) => a.period.localeCompare(b.period));

      const repoKeys = new Set([...repoCommitCountMap.keys(), ...repoTokenMap.keys()]);
      const repoStats = [...repoKeys].map(k => {
        const [p, repoName] = splitKey(k);
        return { period: p, repoName, count: repoCommitCountMap.get(k) ?? 0, tokens: repoTokenMap.get(k) ?? 0 };
      }).sort((a, b) => a.period.localeCompare(b.period));

      return { toolCounts, errorRate, skillStats, modelStats, agentStats, commitPrefixStats, aiFirstTryRate: [], repoStats };
    } catch (e) {
      console.error('[CombinedDataReader.getCombinedData] failed', e);
      return null;
    }
  }
}

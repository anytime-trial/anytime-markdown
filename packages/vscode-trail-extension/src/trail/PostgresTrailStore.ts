import { Pool } from 'pg';
import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseFeatureRow, ReleaseRow } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';

export class PostgresTrailStore implements IRemoteTrailStore {
  private pool: Pool | null = null;

  constructor(private readonly connectionString: string) {}

  async connect(): Promise<void> {
    this.pool = new Pool({ connectionString: this.connectionString });
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }

  async clearAll(): Promise<void> {
    const pool = this.ensurePool();
    // CASCADE により messages / session_commits / session_costs / release_files / release_features も消える
    await pool.query('DELETE FROM trail_sessions');
    await pool.query('DELETE FROM trail_releases');
    await pool.query('DELETE FROM trail_daily_costs');
    await pool.query('DELETE FROM trail_release_graphs');
    await pool.query('DELETE FROM trail_current_graphs');
  }

  async getExistingSessionIds(): Promise<readonly string[]> {
    const { rows } = await this.ensurePool().query('SELECT id FROM trail_sessions');
    return rows.map((r: { id: string }) => r.id);
  }

  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> {
    const { rows } = await this.ensurePool().query(
      'SELECT id, imported_at FROM trail_sessions',
    );
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.id, row.imported_at ?? '');
    }
    return map;
  }

  async upsertSessions(rows: readonly SessionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_sessions (
          id, slug, project, repo_name, git_branch, cwd, model, version, entrypoint,
          permission_mode, start_time, end_time, message_count,
          input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
          file_path, file_size, imported_at,
          peak_context_tokens, initial_context_tokens, commits_resolved_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20,
          $21, $22, $23, NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug, project = EXCLUDED.project,
          repo_name = EXCLUDED.repo_name,
          git_branch = EXCLUDED.git_branch, cwd = EXCLUDED.cwd,
          model = EXCLUDED.model, version = EXCLUDED.version,
          entrypoint = EXCLUDED.entrypoint, permission_mode = EXCLUDED.permission_mode,
          start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time,
          message_count = EXCLUDED.message_count,
          input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
          cache_read_tokens = EXCLUDED.cache_read_tokens,
          cache_creation_tokens = EXCLUDED.cache_creation_tokens,
          file_path = EXCLUDED.file_path, file_size = EXCLUDED.file_size,
          imported_at = EXCLUDED.imported_at,
          peak_context_tokens = EXCLUDED.peak_context_tokens,
          initial_context_tokens = EXCLUDED.initial_context_tokens,
          commits_resolved_at = EXCLUDED.commits_resolved_at,
          synced_at = NOW()`,
        [
          r.id, r.slug, r.project, r.repo_name, r.git_branch, r.cwd, r.model,
          r.version, r.entrypoint, r.permission_mode,
          r.start_time, r.end_time, r.message_count,
          r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens,
          r.file_path, r.file_size, r.imported_at,
          r.peak_context_tokens ?? null, r.initial_context_tokens ?? null,
          r.commits_resolved_at ?? null,
        ],
      );
    }
  }

  async upsertMessages(rows: readonly MessageRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      for (const r of chunk) {
        await pool.query(
          `INSERT INTO trail_messages (
            uuid, session_id, parent_uuid, type, subtype,
            text_content, user_content, tool_calls, tool_use_result,
            model, request_id, stop_reason,
            input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
            service_tier, speed, timestamp,
            is_sidechain, is_meta, cwd, git_branch
          ) VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9,
            $10, $11, $12,
            $13, $14, $15, $16,
            $17, $18, $19,
            $20, $21, $22, $23
          ) ON CONFLICT (uuid) DO UPDATE SET
            session_id = EXCLUDED.session_id, parent_uuid = EXCLUDED.parent_uuid,
            type = EXCLUDED.type, subtype = EXCLUDED.subtype,
            text_content = EXCLUDED.text_content, user_content = EXCLUDED.user_content,
            tool_calls = EXCLUDED.tool_calls, tool_use_result = EXCLUDED.tool_use_result,
            model = EXCLUDED.model, request_id = EXCLUDED.request_id,
            stop_reason = EXCLUDED.stop_reason,
            input_tokens = EXCLUDED.input_tokens, output_tokens = EXCLUDED.output_tokens,
            cache_read_tokens = EXCLUDED.cache_read_tokens,
            cache_creation_tokens = EXCLUDED.cache_creation_tokens,
            service_tier = EXCLUDED.service_tier, speed = EXCLUDED.speed,
            timestamp = EXCLUDED.timestamp,
            is_sidechain = EXCLUDED.is_sidechain, is_meta = EXCLUDED.is_meta,
            cwd = EXCLUDED.cwd, git_branch = EXCLUDED.git_branch`,
          [
            r.uuid, r.session_id, r.parent_uuid, r.type, r.subtype,
            r.text_content, r.user_content, r.tool_calls, r.tool_use_result,
            r.model, r.request_id, r.stop_reason,
            r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens,
            r.service_tier, r.speed, r.timestamp,
            r.is_sidechain, r.is_meta, r.cwd, r.git_branch,
          ],
        );
      }
    }
  }

  async upsertCommits(rows: readonly SessionCommitRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_session_commits (
          session_id, commit_hash, commit_message, author,
          committed_at, is_ai_assisted, files_changed,
          lines_added, lines_deleted
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (session_id, commit_hash) DO UPDATE SET
          commit_message = EXCLUDED.commit_message, author = EXCLUDED.author,
          committed_at = EXCLUDED.committed_at, is_ai_assisted = EXCLUDED.is_ai_assisted,
          files_changed = EXCLUDED.files_changed,
          lines_added = EXCLUDED.lines_added, lines_deleted = EXCLUDED.lines_deleted`,
        [
          r.session_id, r.commit_hash, r.commit_message, r.author,
          r.committed_at, r.is_ai_assisted, r.files_changed,
          r.lines_added, r.lines_deleted,
        ],
      );
    }
  }

  async upsertReleases(rows: readonly ReleaseRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_releases (
          tag, released_at, prev_tag, repo_name, package_tags, commit_count,
          files_changed, lines_added, lines_deleted,
          feat_count, fix_count, refactor_count, test_count, other_count,
          affected_packages, duration_days, resolved_at, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
        ON CONFLICT (tag) DO UPDATE SET
          released_at = EXCLUDED.released_at, prev_tag = EXCLUDED.prev_tag,
          repo_name = EXCLUDED.repo_name,
          package_tags = EXCLUDED.package_tags, commit_count = EXCLUDED.commit_count,
          files_changed = EXCLUDED.files_changed, lines_added = EXCLUDED.lines_added,
          lines_deleted = EXCLUDED.lines_deleted, feat_count = EXCLUDED.feat_count,
          fix_count = EXCLUDED.fix_count, refactor_count = EXCLUDED.refactor_count,
          test_count = EXCLUDED.test_count, other_count = EXCLUDED.other_count,
          affected_packages = EXCLUDED.affected_packages, duration_days = EXCLUDED.duration_days,
          resolved_at = EXCLUDED.resolved_at, synced_at = NOW()`,
        [
          r.tag, r.released_at, r.prev_tag ?? null, r.repo_name, r.package_tags, r.commit_count,
          r.files_changed, r.lines_added, r.lines_deleted,
          r.feat_count, r.fix_count, r.refactor_count, r.test_count, r.other_count,
          r.affected_packages, r.duration_days, r.resolved_at ?? null,
        ],
      );
    }
  }

  async upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_release_files (release_tag, file_path, lines_added, lines_deleted, change_type)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (release_tag, file_path) DO UPDATE SET
          lines_added = EXCLUDED.lines_added, lines_deleted = EXCLUDED.lines_deleted,
          change_type = EXCLUDED.change_type`,
        [r.release_tag, r.file_path, r.lines_added, r.lines_deleted, r.change_type],
      );
    }
  }

  async upsertReleaseFeatures(rows: readonly ReleaseFeatureRow[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_release_features (release_tag, feature_id, feature_name, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (release_tag, feature_id) DO UPDATE SET
          feature_name = EXCLUDED.feature_name, role = EXCLUDED.role`,
        [r.release_tag, r.feature_id, r.feature_name, r.role],
      );
    }
  }

  async upsertSessionCosts(sessionId: string, costs: readonly {
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (costs.length === 0) return;
    const pool = this.ensurePool();
    for (const c of costs) {
      await pool.query(
        `INSERT INTO trail_session_costs (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (session_id, model) DO UPDATE SET
           input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens,
           cache_read_tokens=EXCLUDED.cache_read_tokens, cache_creation_tokens=EXCLUDED.cache_creation_tokens,
           estimated_cost_usd=EXCLUDED.estimated_cost_usd`,
        [sessionId, c.model, c.input_tokens, c.output_tokens, c.cache_read_tokens, c.cache_creation_tokens, c.estimated_cost_usd],
      );
    }
  }

  async upsertAllSessionCosts(rows: readonly {
    session_id: string;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO trail_session_costs (session_id, model, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (session_id, model) DO UPDATE SET
           input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens,
           cache_read_tokens=EXCLUDED.cache_read_tokens, cache_creation_tokens=EXCLUDED.cache_creation_tokens,
           estimated_cost_usd=EXCLUDED.estimated_cost_usd`,
        [r.session_id, r.model, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens, r.estimated_cost_usd],
      );
    }
  }

  async upsertDailyCosts(rows: readonly {
    date: string;
    model: string;
    cost_type: string;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_creation_tokens: number;
    estimated_cost_usd: number;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO daily_costs (date, model, cost_type, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, estimated_cost_usd)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (date, model, cost_type) DO UPDATE SET
           input_tokens=EXCLUDED.input_tokens, output_tokens=EXCLUDED.output_tokens,
           cache_read_tokens=EXCLUDED.cache_read_tokens, cache_creation_tokens=EXCLUDED.cache_creation_tokens,
           estimated_cost_usd=EXCLUDED.estimated_cost_usd`,
        [r.date, r.model, r.cost_type, r.input_tokens, r.output_tokens, r.cache_read_tokens, r.cache_creation_tokens, r.estimated_cost_usd],
      );
    }
  }

  async clearCurrentGraphs(): Promise<void> {
    const pool = this.ensurePool();
    await pool.query('DELETE FROM trail_current_graphs');
  }

  async clearReleaseGraphs(): Promise<void> {
    const pool = this.ensurePool();
    await pool.query('DELETE FROM trail_release_graphs');
  }

  async upsertCurrentGraph(repoName: string, graphJson: string, commitId: string): Promise<void> {
    const pool = this.ensurePool();
    await pool.query(
      `INSERT INTO trail_current_graphs (repo_name, commit_id, graph_json, updated_at, synced_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (repo_name) DO UPDATE SET
        commit_id = EXCLUDED.commit_id, graph_json = EXCLUDED.graph_json,
        updated_at = EXCLUDED.updated_at, synced_at = NOW()`,
      [repoName, commitId, graphJson, new Date().toISOString()],
    );
  }

  async upsertReleaseGraph(tag: string, graphJson: string): Promise<void> {
    const pool = this.ensurePool();
    await pool.query(
      `INSERT INTO trail_release_graphs (tag, graph_json, updated_at, synced_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (tag) DO UPDATE SET
        graph_json = EXCLUDED.graph_json,
        updated_at = EXCLUDED.updated_at, synced_at = NOW()`,
      [tag, graphJson, new Date().toISOString()],
    );
  }

  async upsertMessageToolCalls(rows: readonly {
    id: number;
    session_id: string;
    message_uuid: string;
    turn_index: number;
    call_index: number;
    tool_name: string;
    file_path: string | null;
    command: string | null;
    skill_name: string | null;
    model: string | null;
    is_sidechain: number;
    turn_exec_ms: number | null;
    has_thinking: number;
    is_error: number;
    error_type: string | null;
    timestamp: string;
  }[]): Promise<void> {
    if (rows.length === 0) return;
    const pool = this.ensurePool();
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const placeholders = chunk.map((r, j) => {
        const base = j * 16;
        values.push(
          r.id, r.session_id, r.message_uuid, r.turn_index, r.call_index,
          r.tool_name, r.file_path, r.command, r.skill_name, r.model,
          r.is_sidechain, r.turn_exec_ms, r.has_thinking, r.is_error, r.error_type, r.timestamp,
        );
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14},$${base + 15},$${base + 16})`;
      });
      await pool.query(
        `INSERT INTO trail_message_tool_calls
          (id, session_id, message_uuid, turn_index, call_index, tool_name,
           file_path, command, skill_name, model, is_sidechain, turn_exec_ms,
           has_thinking, is_error, error_type, timestamp)
         VALUES ${placeholders.join(',')}
         ON CONFLICT (session_id, message_uuid, call_index) DO UPDATE SET
           turn_index = EXCLUDED.turn_index,
           tool_name = EXCLUDED.tool_name,
           file_path = EXCLUDED.file_path,
           command = EXCLUDED.command,
           skill_name = EXCLUDED.skill_name,
           model = EXCLUDED.model,
           is_sidechain = EXCLUDED.is_sidechain,
           turn_exec_ms = EXCLUDED.turn_exec_ms,
           has_thinking = EXCLUDED.has_thinking,
           is_error = EXCLUDED.is_error,
           error_type = EXCLUDED.error_type,
           timestamp = EXCLUDED.timestamp`,
        values,
      );
    }
  }

  private ensurePool(): Pool {
    if (!this.pool) throw new Error('PostgresTrailStore not connected');
    return this.pool;
  }
}

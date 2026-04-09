import { Pool } from 'pg';
import type { SessionRow, MessageRow, SessionCommitRow } from './TrailDatabase';
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
          id, slug, project, git_branch, cwd, model, version, entrypoint,
          permission_mode, start_time, end_time, message_count,
          input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens,
          file_path, file_size, imported_at,
          peak_context_tokens, initial_context_tokens, commits_resolved_at, synced_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12,
          $13, $14, $15, $16,
          $17, $18, $19,
          $20, $21, $22, NOW()
        ) ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug, project = EXCLUDED.project,
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
          r.id, r.slug, r.project, r.git_branch, r.cwd, r.model,
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

  private ensurePool(): Pool {
    if (!this.pool) throw new Error('PostgresTrailStore not connected');
    return this.pool;
  }
}

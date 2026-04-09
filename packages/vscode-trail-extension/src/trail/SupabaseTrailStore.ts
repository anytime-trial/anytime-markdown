import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionRow, MessageRow, SessionCommitRow } from './TrailDatabase';
import type { IRemoteTrailStore } from './IRemoteTrailStore';

export class SupabaseTrailStore implements IRemoteTrailStore {
  private client: SupabaseClient | null = null;

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  async connect(): Promise<void> {
    this.client = createClient(this.url, this.anonKey);
  }

  async close(): Promise<void> {
    this.client = null;
  }

  async getExistingSessionIds(): Promise<readonly string[]> {
    const { data, error } = await this.ensureClient()
      .from('trail_sessions')
      .select('id');
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    return (data ?? []).map((r: { id: string }) => r.id);
  }

  async getExistingSyncedAt(): Promise<ReadonlyMap<string, string>> {
    const { data, error } = await this.ensureClient()
      .from('trail_sessions')
      .select('id, imported_at');
    if (error) throw new Error(`Supabase query failed: ${error.message}`);
    const map = new Map<string, string>();
    for (const row of data ?? []) {
      map.set(row.id, row.imported_at ?? '');
    }
    return map;
  }

  async upsertSessions(rows: readonly SessionRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      id: r.id, slug: r.slug, project: r.project,
      git_branch: r.git_branch, cwd: r.cwd, model: r.model,
      version: r.version, entrypoint: r.entrypoint,
      permission_mode: r.permission_mode,
      start_time: r.start_time, end_time: r.end_time,
      message_count: r.message_count,
      input_tokens: r.input_tokens, output_tokens: r.output_tokens,
      cache_read_tokens: r.cache_read_tokens,
      cache_creation_tokens: r.cache_creation_tokens,
      file_path: r.file_path, file_size: r.file_size,
      imported_at: r.imported_at,
      peak_context_tokens: r.peak_context_tokens ?? null,
      initial_context_tokens: r.initial_context_tokens ?? null,
      commits_resolved_at: r.commits_resolved_at ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_sessions')
      .upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(`Supabase upsert sessions failed: ${error.message}`);
  }

  async upsertMessages(rows: readonly MessageRow[]): Promise<void> {
    if (rows.length === 0) return;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK).map((r) => ({
        uuid: r.uuid, session_id: r.session_id,
        parent_uuid: r.parent_uuid, type: r.type, subtype: r.subtype,
        text_content: r.text_content, user_content: r.user_content,
        tool_calls: r.tool_calls, tool_use_result: r.tool_use_result,
        model: r.model, request_id: r.request_id, stop_reason: r.stop_reason,
        input_tokens: r.input_tokens, output_tokens: r.output_tokens,
        cache_read_tokens: r.cache_read_tokens,
        cache_creation_tokens: r.cache_creation_tokens,
        service_tier: r.service_tier, speed: r.speed,
        timestamp: r.timestamp,
        is_sidechain: r.is_sidechain, is_meta: r.is_meta,
        cwd: r.cwd, git_branch: r.git_branch,
      }));
      const { error } = await this.ensureClient()
        .from('trail_messages')
        .upsert(chunk, { onConflict: 'uuid' });
      if (error) throw new Error(`Supabase upsert messages failed: ${error.message}`);
    }
  }

  async upsertCommits(rows: readonly SessionCommitRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      session_id: r.session_id, commit_hash: r.commit_hash,
      commit_message: r.commit_message, author: r.author,
      committed_at: r.committed_at, is_ai_assisted: r.is_ai_assisted,
      files_changed: r.files_changed,
      lines_added: r.lines_added, lines_deleted: r.lines_deleted,
    }));
    const { error } = await this.ensureClient()
      .from('trail_session_commits')
      .upsert(mapped, { onConflict: 'session_id,commit_hash' });
    if (error) throw new Error(`Supabase upsert commits failed: ${error.message}`);
  }

  private ensureClient(): SupabaseClient {
    if (!this.client) throw new Error('SupabaseTrailStore not connected');
    return this.client;
  }
}

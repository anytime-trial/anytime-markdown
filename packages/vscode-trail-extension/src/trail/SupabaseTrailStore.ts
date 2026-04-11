import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionRow, MessageRow, SessionCommitRow } from './TrailDatabase';
import type { TaskRow, TaskFileRow, TaskC4ElementRow, TaskFeatureRow } from './TaskResolver';
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
      version: r.version, entrypoint: r.entrypoint, model: r.model,
      start_time: r.start_time, end_time: r.end_time,
      message_count: r.message_count,
      file_path: r.file_path, file_size: r.file_size,
      imported_at: r.imported_at,
      commits_resolved_at: r.commits_resolved_at ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_sessions')
      .upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(`Supabase upsert sessions failed: ${error.message}`);
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
    const mapped = costs.map((c) => ({
      session_id: sessionId,
      model: c.model,
      input_tokens: c.input_tokens,
      output_tokens: c.output_tokens,
      cache_read_tokens: c.cache_read_tokens,
      cache_creation_tokens: c.cache_creation_tokens,
      estimated_cost_usd: c.estimated_cost_usd,
    }));
    const { error } = await this.ensureClient()
      .from('trail_session_costs')
      .upsert(mapped, { onConflict: 'session_id,model' });
    if (error) throw new Error(`Supabase upsert session_costs failed: ${error.message}`);
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

  async upsertTasks(rows: readonly TaskRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      id: r.id, merge_commit_hash: r.merge_commit_hash,
      branch_name: r.branch_name, pr_number: r.pr_number,
      title: r.title, merged_at: r.merged_at, base_branch: r.base_branch,
      commit_count: r.commit_count, files_changed: r.files_changed,
      lines_added: r.lines_added, lines_deleted: r.lines_deleted,
      session_count: r.session_count,
      total_input_tokens: r.total_input_tokens,
      total_output_tokens: r.total_output_tokens,
      total_cache_read_tokens: r.total_cache_read_tokens,
      total_duration_ms: r.total_duration_ms,
      resolved_at: r.resolved_at,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_tasks')
      .upsert(mapped, { onConflict: 'id' });
    if (error) throw new Error(`Supabase upsert tasks failed: ${error.message}`);
  }

  async upsertTaskFiles(rows: readonly TaskFileRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      task_id: r.task_id, file_path: r.file_path,
      lines_added: r.lines_added, lines_deleted: r.lines_deleted,
      change_type: r.change_type,
    }));
    const { error } = await this.ensureClient()
      .from('trail_task_files')
      .upsert(mapped, { onConflict: 'task_id,file_path' });
    if (error) throw new Error(`Supabase upsert task files failed: ${error.message}`);
  }

  async upsertTaskC4Elements(rows: readonly TaskC4ElementRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      task_id: r.task_id, element_id: r.element_id,
      element_type: r.element_type, element_name: r.element_name,
      match_type: r.match_type,
    }));
    const { error } = await this.ensureClient()
      .from('trail_task_c4_elements')
      .upsert(mapped, { onConflict: 'task_id,element_id' });
    if (error) throw new Error(`Supabase upsert task C4 elements failed: ${error.message}`);
  }

  async upsertTaskFeatures(rows: readonly TaskFeatureRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      task_id: r.task_id, feature_id: r.feature_id,
      feature_name: r.feature_name, role: r.role,
    }));
    const { error } = await this.ensureClient()
      .from('trail_task_features')
      .upsert(mapped, { onConflict: 'task_id,feature_id' });
    if (error) throw new Error(`Supabase upsert task features failed: ${error.message}`);
  }

  async upsertC4Model(json: string, revision: string): Promise<void> {
    const { error } = await this.ensureClient()
      .from('trail_c4_models')
      .upsert({
        id: 'current',
        model_json: json,
        revision,
        updated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    if (error) throw new Error(`Supabase upsert C4 model failed: ${error.message}`);
  }

  private ensureClient(): SupabaseClient {
    if (!this.client) throw new Error('SupabaseTrailStore not connected');
    return this.client;
  }
}

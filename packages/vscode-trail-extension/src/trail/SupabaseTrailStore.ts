import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SessionRow, MessageRow, SessionCommitRow, ReleaseFileRow, ReleaseFeatureRow, ReleaseRow } from './TrailDatabase';
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
      id: r.id, slug: r.slug, project: r.project, repo_name: r.repo_name,
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
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await this.ensureClient()
        .from('trail_session_costs')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'session_id,model' });
      if (error) throw new Error(`Supabase upsert all session_costs failed: ${error.message}`);
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
    const { error } = await this.ensureClient()
      .from('trail_daily_costs')
      .upsert(rows, { onConflict: 'date,model,cost_type' });
    if (error) throw new Error(`Supabase upsert trail_daily_costs failed: ${error.message}`);
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

  async upsertReleases(rows: readonly ReleaseRow[]): Promise<void> {
    if (rows.length === 0) return;
    const mapped = rows.map((r) => ({
      tag: r.tag, released_at: r.released_at, prev_tag: r.prev_tag ?? null,
      repo_name: r.repo_name, package_tags: r.package_tags, commit_count: r.commit_count,
      files_changed: r.files_changed, lines_added: r.lines_added, lines_deleted: r.lines_deleted,
      feat_count: r.feat_count, fix_count: r.fix_count, refactor_count: r.refactor_count,
      test_count: r.test_count, other_count: r.other_count,
      affected_packages: r.affected_packages, duration_days: r.duration_days,
      resolved_at: r.resolved_at ?? null,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await this.ensureClient()
      .from('trail_releases')
      .upsert(mapped, { onConflict: 'tag' });
    if (error) throw new Error(`Supabase upsert trail_releases failed: ${error.message}`);
  }

  async upsertReleaseFiles(rows: readonly ReleaseFileRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.ensureClient()
      .from('trail_release_files')
      .upsert(rows.map((r) => ({
        release_tag: r.release_tag,
        file_path: r.file_path,
        lines_added: r.lines_added,
        lines_deleted: r.lines_deleted,
        change_type: r.change_type,
      })), { onConflict: 'release_tag,file_path' });
    if (error) throw new Error(`Supabase upsert release_files failed: ${error.message}`);
  }

  async upsertReleaseFeatures(rows: readonly ReleaseFeatureRow[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.ensureClient()
      .from('trail_release_features')
      .upsert(rows.map((r) => ({
        release_tag: r.release_tag,
        feature_id: r.feature_id,
        feature_name: r.feature_name,
        role: r.role,
      })), { onConflict: 'release_tag,feature_id' });
    if (error) throw new Error(`Supabase upsert release_features failed: ${error.message}`);
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

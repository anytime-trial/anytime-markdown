// supabase/SupabaseC4ModelStore.ts — Supabase backed IC4ModelStore
//
// web アプリの Next.js API route、および拡張機能以外のサーバ側処理から利用する。
// trail_current_c4_models（リポジトリ別 current）と trail_c4_models（リリース）の
// 2 テーブルを統合して IC4ModelStore を提供する。

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import type {
  C4ModelEntry,
  C4ModelResult,
  IC4ModelStore,
} from '@anytime-markdown/trail-core/domain';

interface CurrentC4Row {
  readonly repo_name: string;
  readonly commit_id: string;
  readonly model_json: string;
}

interface ReleaseC4Row {
  readonly id: string;
  readonly model_json: string;
}

interface TrailReleaseRow {
  readonly tag: string;
  readonly repo_name: string | null;
  readonly released_at: string | null;
}

export class SupabaseC4ModelStore implements IC4ModelStore {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.client = createClient(url, anonKey);
  }

  async getCurrentC4Model(repoName: string): Promise<C4ModelResult | null> {
    const { data, error } = await this.client
      .from('trail_current_c4_models')
      .select('repo_name, commit_id, model_json')
      .eq('repo_name', repoName)
      .maybeSingle<CurrentC4Row>();
    if (error || !data) return null;
    const model = SupabaseC4ModelStore.parseModel(data.model_json);
    if (!model) return null;
    return { model, commitId: data.commit_id };
  }

  async getReleaseC4Model(tag: string): Promise<C4ModelResult | null> {
    const { data, error } = await this.client
      .from('trail_c4_models')
      .select('id, model_json')
      .eq('id', tag)
      .maybeSingle<ReleaseC4Row>();
    if (error || !data) return null;
    const model = SupabaseC4ModelStore.parseModel(data.model_json);
    if (!model) return null;
    return { model };
  }

  async getC4ModelEntries(): Promise<readonly C4ModelEntry[]> {
    // 2 テーブルへの SELECT を並列実行する
    const [currentRes, releaseRes] = await Promise.all([
      this.client
        .from('trail_current_c4_models')
        .select('repo_name')
        .returns<{ repo_name: string }[]>(),
      this.client
        .from('trail_releases')
        .select('tag, repo_name, released_at')
        .order('released_at', { ascending: false })
        .returns<TrailReleaseRow[]>(),
    ]);
    if (currentRes.error) {
      console.error('[SupabaseC4ModelStore] trail_current_c4_models select failed:', currentRes.error.message);
    }
    if (releaseRes.error) {
      console.error('[SupabaseC4ModelStore] trail_releases select failed:', releaseRes.error.message);
    }

    const entries: C4ModelEntry[] = [];
    for (const r of currentRes.data ?? []) {
      entries.push({ tag: 'current', repoName: r.repo_name });
    }
    for (const r of releaseRes.data ?? []) {
      entries.push({ tag: r.tag, repoName: r.repo_name });
    }
    return entries;
  }

  private static parseModel(json: string): C4Model | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        return parsed as C4Model;
      }
      return null;
    } catch {
      return null;
    }
  }
}

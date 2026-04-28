// supabase/SupabaseC4ModelStore.ts — Supabase backed IC4ModelStore
//
// web アプリの Next.js API route から利用する。
// trail_current_graphs（リポジトリ別 current）と trail_release_graphs（リリース）の
// 2 テーブルから TrailGraph を取得し、trailToC4() で C4Model に変換して返す。

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { C4Model } from '@anytime-markdown/trail-core/c4';
import { trailToC4 } from '@anytime-markdown/trail-core/transform';
import type { TrailGraph } from '@anytime-markdown/trail-core/model';
import type {
  C4ModelEntry,
  C4ModelResult,
  IC4ModelStore,
} from '@anytime-markdown/trail-core/domain';

interface CurrentGraphRow {
  readonly repo_name: string;
  readonly commit_id: string;
  readonly graph_json: string;
}

interface ReleaseGraphRow {
  readonly tag: string;
  readonly graph_json: string;
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
    const result = await this.getCurrentGraph(repoName);
    if (!result) return null;
    return { model: trailToC4(result.graph), commitId: result.commitId };
  }

  async getReleaseC4Model(tag: string): Promise<C4ModelResult | null> {
    const graph = await this.getReleaseGraph(tag);
    if (!graph) return null;
    return { model: trailToC4(graph) };
  }

  /** 生の TrailGraph を取得する（DSM 計算用）。 */
  async getCurrentGraph(repoName: string): Promise<{ graph: TrailGraph; commitId: string } | null> {
    const { data, error } = await this.client
      .from('trail_current_graphs')
      .select('repo_name, commit_id, graph_json')
      .eq('repo_name', repoName)
      .maybeSingle<CurrentGraphRow>();
    if (error || !data) return null;
    const graph = SupabaseC4ModelStore.parseGraph(data.graph_json);
    if (!graph) return null;
    return { graph, commitId: data.commit_id };
  }

  /** リリース別の生の TrailGraph を取得する（DSM 計算用）。 */
  async getReleaseGraph(tag: string): Promise<TrailGraph | null> {
    const { data, error } = await this.client
      .from('trail_release_graphs')
      .select('tag, graph_json')
      .eq('tag', tag)
      .maybeSingle<ReleaseGraphRow>();
    if (error || !data) return null;
    return SupabaseC4ModelStore.parseGraph(data.graph_json);
  }

  async getC4ModelEntries(): Promise<readonly C4ModelEntry[]> {
    // 2 テーブルへの SELECT を並列実行する
    const [currentRes, releaseRes] = await Promise.all([
      this.client
        .from('trail_current_graphs')
        .select('repo_name')
        .returns<{ repo_name: string }[]>(),
      this.client
        .from('trail_releases')
        .select('tag, repo_name, released_at')
        .order('released_at', { ascending: false })
        .returns<TrailReleaseRow[]>(),
    ]);
    if (currentRes.error) {
      console.error('[SupabaseC4ModelStore] trail_current_graphs select failed:', currentRes.error.message);
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

  private static parseGraph(json: string): TrailGraph | null {
    try {
      const parsed: unknown = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        return parsed as TrailGraph;
      }
      return null;
    } catch {
      return null;
    }
  }
}

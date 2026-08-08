// supabase/SupabaseC4ModelStore.ts — C4Reader への薄いファサード
//
// 後方互換のため `new SupabaseC4ModelStore(url, anonKey)` の生成シグネチャを維持する。
// ロジックは data/readers/C4Reader.ts に集約済み。
// 新規利用箇所は C4Reader を直接参照すること（@deprecated 相当）。

import { createClient } from '@supabase/supabase-js';
import type { TrailGraph } from '@anytime-markdown/trail-activity/model';
import type {
  C4ModelEntry,
  C4ModelResult,
  IC4ModelStore,
} from '@anytime-markdown/trail-activity/domain';
import { C4Reader } from '../data/readers/C4Reader';

export class SupabaseC4ModelStore implements IC4ModelStore {
  private readonly reader: C4Reader;

  constructor(url: string, anonKey: string) {
    this.reader = new C4Reader(createClient(url, anonKey));
  }

  getCurrentC4Model(repoName: string): Promise<C4ModelResult | null> {
    return this.reader.getCurrentC4Model(repoName);
  }

  getReleaseC4Model(tag: string): Promise<C4ModelResult | null> {
    return this.reader.getReleaseC4Model(tag);
  }

  getCurrentGraph(repoName: string): Promise<{ graph: TrailGraph; commitId: string } | null> {
    return this.reader.getCurrentGraph(repoName);
  }

  getReleaseGraph(tag: string): Promise<TrailGraph | null> {
    return this.reader.getReleaseGraph(tag);
  }

  getC4ModelEntries(): Promise<readonly C4ModelEntry[]> {
    return this.reader.getC4ModelEntries();
  }
}

import { fetchC4Model } from "@anytime-markdown/trail-core/c4";
import { aggregateScoresToC4 } from "@anytime-markdown/trail-core/deadCode";
import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore, NO_STORE_HEADERS } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

interface SupabaseFileAnalysisRow {
  repo_name: string;
  file_path: string;
  importance_score: number;
  fan_in_total: number;
  cognitive_complexity_max: number;
  function_count: number;
  line_count: number;
  dead_code_score: number;
  signal_orphan: number;
  signal_fan_in_zero: number;
  signal_no_recent_churn: number;
  signal_zero_coverage: number;
  signal_isolated_community: number;
  is_ignored: number;
  ignore_reason: string;
}

/**
 * GET /api/c4/file-analysis?repo=...&tag=current|<release_tag>
 *
 * 拡張機能の /api/c4/file-analysis と互換。
 * tag === 'current' のときは trail_current_file_analysis を、
 * 特定タグのときは trail_release_file_analysis を返す。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const repo = request.nextUrl.searchParams.get('repo') ?? '';
  const tag = request.nextUrl.searchParams.get('tag') ?? 'current';
  const empty = { entries: [], elementMatrix: { importance: {}, deadCodeScore: {} } };

  if (!repo) {
    return NextResponse.json({ error: 'repo is required' }, { status: 400 });
  }

  const env = resolveSupabaseEnv();
  if (!env) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

  try {
    const supabase = createClient(env.url, env.anonKey);
    const tableName = tag === 'current' ? 'trail_current_file_analysis' : 'trail_release_file_analysis';

    let q = supabase.from(tableName).select('*').eq('repo_name', repo);
    if (tag !== 'current') {
      q = q.eq('release_tag', tag);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
    }

    const rows = (data ?? []) as SupabaseFileAnalysisRow[];

    const entries = rows.map((r) => ({
      filePath: r.file_path,
      importanceScore: r.importance_score,
      fanInTotal: r.fan_in_total,
      cognitiveComplexityMax: r.cognitive_complexity_max,
      lineCount: r.line_count,
      functionCount: r.function_count,
      deadCodeScore: r.dead_code_score,
      signals: {
        orphan: r.signal_orphan === 1,
        fanInZero: r.signal_fan_in_zero === 1,
        noRecentChurn: r.signal_no_recent_churn === 1,
        zeroCoverage: r.signal_zero_coverage === 1,
        isolatedCommunity: r.signal_isolated_community === 1,
      },
      isIgnored: r.is_ignored === 1,
      ignoreReason: r.ignore_reason,
    }));

    // Element aggregation
    let importance: Record<string, number> = {};
    let deadCodeScore: Record<string, number> = {};
    const store = createC4ModelStore();
    if (store) {
      const payload = await fetchC4Model(store, tag, repo);
      const elements = payload?.model?.elements ?? [];
      const importanceMap: Record<string, number> = {};
      const deadCodeMap: Record<string, number> = {};
      for (const r of rows) {
        importanceMap[r.file_path] = r.importance_score;
        deadCodeMap[r.file_path] = r.dead_code_score;
      }
      importance = aggregateScoresToC4(importanceMap, elements);
      // dead-code-score は importance と同じく親要素にも伝播させ、
      // viewer 側で levelTargetType に応じてフィルタする（フレーム着色防止のため）
      deadCodeScore = aggregateScoresToC4(deadCodeMap, elements);
    }

    return NextResponse.json(
      { entries, elementMatrix: { importance, deadCodeScore } },
      { headers: NO_STORE_HEADERS },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

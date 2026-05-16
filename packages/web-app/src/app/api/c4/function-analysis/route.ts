import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { NO_STORE_HEADERS } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

interface SupabaseFunctionAnalysisRow {
  repo_name: string;
  file_path: string;
  function_name: string;
  start_line: number;
  end_line: number;
  language: string;
  fan_in: number;
  cognitive_complexity: number;
  cyclomatic_complexity: number;
  data_mutation_score: number;
  side_effect_score: number;
  line_count: number;
  importance_score: number;
  signal_fan_in_zero: number;
  fan_out: number;
  distinct_callees: number;
  function_role: string;
  analyzed_at: string;
}

type FunctionRole = 'hub' | 'leaf' | 'orchestrator' | 'peripheral';

function normalizeFunctionRole(value: string): FunctionRole {
  return value === 'hub' || value === 'leaf' || value === 'orchestrator' || value === 'peripheral'
    ? value
    : 'peripheral';
}

/**
 * GET /api/c4/function-analysis?repo=...&tag=current|<release_tag>&file=<file_path>
 *
 * 拡張機能の /api/c4/function-analysis と互換。
 * tag === 'current' のときは trail_current_function_analysis を、
 * 特定タグのときは trail_release_function_analysis を返す。
 * file クエリパラメータで特定ファイルに絞り込みも可能。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const repo = request.nextUrl.searchParams.get('repo') ?? '';
  const tag = request.nextUrl.searchParams.get('tag') ?? 'current';
  const file = request.nextUrl.searchParams.get('file') ?? '';
  const empty = { entries: [] };

  if (!repo) {
    return NextResponse.json({ error: 'repo is required' }, { status: 400 });
  }

  const env = resolveSupabaseEnv();
  if (!env) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

  try {
    const supabase = createClient(env.url, env.anonKey);
    const tableName =
      tag === 'current' ? 'trail_current_function_analysis' : 'trail_release_function_analysis';

    let q = supabase.from(tableName).select('*').eq('repo_name', repo);
    if (tag !== 'current') {
      q = q.eq('release_tag', tag);
    }
    if (file) {
      q = q.eq('file_path', file);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
    }

    const rows = (data ?? []) as SupabaseFunctionAnalysisRow[];

    const entries = rows.map((r) => ({
      repoName: r.repo_name,
      filePath: r.file_path,
      functionName: r.function_name,
      startLine: r.start_line,
      endLine: r.end_line,
      language: r.language,
      fanIn: r.fan_in,
      fanOut: r.fan_out,
      distinctCallees: r.distinct_callees,
      cognitiveComplexity: r.cognitive_complexity,
      cyclomaticComplexity: r.cyclomatic_complexity,
      dataMutationScore: r.data_mutation_score,
      sideEffectScore: r.side_effect_score,
      lineCount: r.line_count,
      importanceScore: r.importance_score,
      functionRole: normalizeFunctionRole(r.function_role),
      signals: { fanInZero: r.signal_fan_in_zero === 1 },
      analyzedAt: r.analyzed_at,
    }));

    return NextResponse.json({ entries }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

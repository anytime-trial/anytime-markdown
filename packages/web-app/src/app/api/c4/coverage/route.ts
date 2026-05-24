import { aggregateCoverageFromDb, fetchC4Model } from "@anytime-markdown/trail-core/c4";
import type { ReleaseCoverageRow } from "@anytime-markdown/trail-core/domain";
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore, NO_STORE_HEADERS, resolveRepoId, resolveReleaseId } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

const COVERAGE_COLUMNS =
  'package,file_path,lines_total,lines_covered,lines_pct,statements_total,statements_covered,statements_pct,functions_total,functions_covered,functions_pct,branches_total,branches_covered,branches_pct';

/**
 * GET /api/c4/coverage?release=...&repo=...
 *
 * 拡張機能の /api/c4/coverage と互換。
 * release === 'current' のときは trail_current_coverage を、
 * 特定タグのときは trail_release_coverage（trail_releases.repo_name JOIN で repo 帰属を確認）を返す。
 *
 * repo 未指定時は trail_current_coverage の先頭行から推定（後方互換）。
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get('release') ?? 'current';
  const repoParam = request.nextUrl.searchParams.get('repo') ?? undefined;
  const empty = { coverageMatrix: null, coverageDiff: null };

  const store = createC4ModelStore();
  if (!store) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

  const env = resolveSupabaseEnv();
  if (!env) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

  try {
    const supabase = createClient(env.url, env.anonKey);

    let repoName = repoParam;
    if (!repoName) {
      const { data: firstRow } = await supabase
        .from('trail_current_coverage')
        .select('repo:trail_repos(repo_name)')
        .limit(1)
        .maybeSingle<{ repo: { repo_name: string } | null }>();
      if (!firstRow?.repo) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
      repoName = firstRow.repo.repo_name;
    }

    const coverageRows = release === 'current'
      ? await fetchCurrentCoverageRows(supabase, repoName)
      : await fetchReleaseCoverageRows(supabase, release, repoName);
    if (coverageRows === null) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

    const payload = await fetchC4Model(store, release, repoName);
    if (!payload) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

    if (coverageRows.length === 0) return NextResponse.json(empty, { headers: NO_STORE_HEADERS });

    const coverageMatrix = aggregateCoverageFromDb(coverageRows, payload.model);
    return NextResponse.json({ coverageMatrix, coverageDiff: null }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/coverage] error', e);
    return NextResponse.json(empty, { headers: NO_STORE_HEADERS });
  }
}

async function fetchCurrentCoverageRows(
  supabase: SupabaseClient,
  repoName: string,
): Promise<ReleaseCoverageRow[]> {
  // trail_current_coverage は repo_id キー。repo_name → repo_id を解決する。
  const repoId = await resolveRepoId(supabase, repoName);
  if (repoId == null) return [];
  const { data } = await supabase
    .from('trail_current_coverage')
    .select(COVERAGE_COLUMNS)
    .eq('repo_id', repoId);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => mapCoverageRow('__current__', r));
}

async function fetchReleaseCoverageRows(
  supabase: SupabaseClient,
  release: string,
  repoName: string,
): Promise<ReleaseCoverageRow[] | null> {
  // tag を (repo_id, tag) で release_id へ解決する (repo 帰属確認を兼ねる)。未登録は null。
  const repoId = await resolveRepoId(supabase, repoName);
  const releaseId = await resolveReleaseId(supabase, release, repoId);
  if (releaseId == null) return null;

  const { data } = await supabase
    .from('trail_release_coverage')
    .select(COVERAGE_COLUMNS)
    .eq('release_id', releaseId);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  return rows.map((r) => mapCoverageRow(release, r));
}

function mapCoverageRow(release_tag: string, r: Record<string, unknown>): ReleaseCoverageRow {
  return {
    release_tag,
    package: String(r.package),
    file_path: String(r.file_path),
    lines_total: Number(r.lines_total),
    lines_covered: Number(r.lines_covered),
    lines_pct: Number(r.lines_pct),
    statements_total: Number(r.statements_total),
    statements_covered: Number(r.statements_covered),
    statements_pct: Number(r.statements_pct),
    functions_total: Number(r.functions_total),
    functions_covered: Number(r.functions_covered),
    functions_pct: Number(r.functions_pct),
    branches_total: Number(r.branches_total),
    branches_covered: Number(r.branches_covered),
    branches_pct: Number(r.branches_pct),
  };
}

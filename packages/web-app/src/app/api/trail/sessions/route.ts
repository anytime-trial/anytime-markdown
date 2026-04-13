import type { NextResponse } from 'next/server';
import { trailReaderRoute } from '../../../../lib/api-helpers';
import type { TrailFilter } from '@anytime-markdown/trail-viewer';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/trail/sessions
 *
 * クエリパラメータ（branch / model / project / q）でフィルタした Trail セッション一覧を返す。
 * データソースは Supabase（SupabaseTrailReader 経由）。
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const filter: TrailFilter = {
    gitBranch: url.searchParams.get('branch') ?? undefined,
    model: url.searchParams.get('model') ?? undefined,
    project: url.searchParams.get('project') ?? undefined,
    searchText: url.searchParams.get('q') ?? undefined,
  };
  return trailReaderRoute((r) => r.getSessions(filter), [], '/api/trail/sessions');
}

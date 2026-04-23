import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_SHOW_UNLIMITED !== '1') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const body = await request.json() as Record<string, unknown>;
  if (!body.fromId || !body.toId) {
    return new NextResponse('fromId and toId required', { status: 400 });
  }

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { data: existing } = await supabase
    .from('trail_c4_manual_relationships')
    .select('rel_id')
    .eq('repo_name', repoName)
    .like('rel_id', 'rel_manual_%');
  const maxN = (existing ?? []).reduce((m: number, row: { rel_id: string }) => {
    const n = Number.parseInt(row.rel_id.substring('rel_manual_'.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const id = `rel_manual_${maxN + 1}`;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('trail_c4_manual_relationships')
    .insert({
      repo_name: repoName, rel_id: id,
      from_id: body.fromId, to_id: body.toId,
      label: body.label ?? null, technology: body.technology ?? null,
      updated_at: now,
    });
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({
    relationship: {
      id, fromId: body.fromId, toId: body.toId,
      label: body.label, technology: body.technology, updatedAt: now,
    },
  }, { status: 201 });
}

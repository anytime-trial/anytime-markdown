import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveSupabaseEnv } from '../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { data, error } = await supabase
    .from('trail_c4_manual_groups')
    .select('group_id, member_ids, label, updated_at')
    .eq('repo_name', repoName)
    .order('group_id');
  if (error) return new NextResponse(error.message, { status: 500 });

  const groups = (data ?? []).map((row: { group_id: string; member_ids: string; label: string | null; updated_at: string }) => ({
    id: row.group_id,
    memberIds: JSON.parse(row.member_ids) as string[],
    label: row.label ?? undefined,
    updatedAt: row.updated_at,
  }));
  return NextResponse.json(groups);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_SHOW_UNLIMITED !== '1') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const body = await request.json() as Record<string, unknown>;
  const memberIds = body.memberIds;
  if (!Array.isArray(memberIds) || memberIds.length < 2) {
    return new NextResponse('memberIds must have at least 2 elements', { status: 400 });
  }

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { data: existing } = await supabase
    .from('trail_c4_manual_groups')
    .select('group_id')
    .eq('repo_name', repoName)
    .like('group_id', 'grp_manual_%');
  const maxN = (existing ?? []).reduce((m: number, row: { group_id: string }) => {
    const n = Number.parseInt(row.group_id.substring('grp_manual_'.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const id = `grp_manual_${maxN + 1}`;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('trail_c4_manual_groups')
    .insert({
      repo_name: repoName,
      group_id: id,
      member_ids: JSON.stringify(memberIds),
      label: body.label ?? null,
      updated_at: now,
    });
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({
    group: { id, memberIds, label: body.label, updatedAt: now },
  }, { status: 201 });
}

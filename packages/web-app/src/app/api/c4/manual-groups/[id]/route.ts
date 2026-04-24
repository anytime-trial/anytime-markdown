import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveSupabaseEnv } from '../../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_SHOW_UNLIMITED !== '1') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const { id } = await context.params;
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const body = await request.json() as Record<string, unknown>;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) updates.label = body.label ?? null;
  if (Array.isArray(body.memberIds)) updates.member_ids = JSON.stringify(body.memberIds);

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { error } = await supabase
    .from('trail_c4_manual_groups')
    .update(updates)
    .eq('repo_name', repoName)
    .eq('group_id', id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_SHOW_UNLIMITED !== '1') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const { id } = await context.params;
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { error } = await supabase
    .from('trail_c4_manual_groups')
    .delete()
    .eq('repo_name', repoName)
    .eq('group_id', id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

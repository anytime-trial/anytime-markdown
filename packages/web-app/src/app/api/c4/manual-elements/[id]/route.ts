import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
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
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.external !== undefined) updates.external = body.external;

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const { data, error } = await supabase
    .from('trail_c4_manual_elements')
    .update(updates)
    .eq('repo_name', repoName)
    .eq('element_id', id)
    .select()
    .single();
  if (error) return new NextResponse(error.message, { status: 404 });

  return NextResponse.json({
    element: {
      id: data.element_id, type: data.type, name: data.name,
      description: data.description ?? undefined, external: data.external,
      parentId: data.parent_id ?? null, updatedAt: data.updated_at,
    },
  });
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

  await supabase
    .from('trail_c4_manual_relationships')
    .delete()
    .eq('repo_name', repoName)
    .or(`from_id.eq.${id},to_id.eq.${id}`);
  const { error } = await supabase
    .from('trail_c4_manual_elements')
    .delete()
    .eq('repo_name', repoName)
    .eq('element_id', id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseEnv } from '../../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

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
    .from('trail_c4_manual_relationships')
    .delete()
    .eq('repo_name', repoName)
    .eq('rel_id', id);
  if (error) return new NextResponse(error.message, { status: 500 });

  return new NextResponse(null, { status: 204 });
}

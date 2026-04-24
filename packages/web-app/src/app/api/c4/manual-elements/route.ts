import { createClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { resolveSupabaseEnv } from '../../../../lib/supabase-env';

export const dynamic = 'force-dynamic';

function getTypePrefix(type: string): string {
  return type === 'person' ? 'person_'
    : type === 'system' ? 'sys_manual_'
    : type === 'container' ? 'pkg_manual_'
    : 'cmp_manual_';
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (process.env.NEXT_PUBLIC_SHOW_UNLIMITED !== '1') {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const repoName = request.nextUrl.searchParams.get('repoName');
  if (!repoName) return new NextResponse('repoName required', { status: 400 });

  const body = await request.json() as Record<string, unknown>;
  if (!['person', 'system', 'container', 'component'].includes(String(body.type))) {
    return new NextResponse('invalid type', { status: 400 });
  }
  if (typeof body.name !== 'string' || body.name.length === 0) {
    return new NextResponse('invalid name', { status: 400 });
  }

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse('Supabase not configured', { status: 503 });
  const supabase = createClient(env.url, env.anonKey);

  const prefix = getTypePrefix(String(body.type));
  const { data: existing } = await supabase
    .from('trail_c4_manual_elements')
    .select('element_id')
    .eq('repo_name', repoName)
    .like('element_id', `${prefix}%`);
  const maxN = (existing ?? []).reduce((m: number, row: { element_id: string }) => {
    const n = Number.parseInt(row.element_id.substring(prefix.length), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  const id = `${prefix}${maxN + 1}`;
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('trail_c4_manual_elements')
    .insert({
      repo_name: repoName,
      element_id: id,
      type: body.type,
      name: body.name,
      description: body.description ?? null,
      external: body.external ?? false,
      parent_id: body.parentId ?? null,
      updated_at: now,
    });
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({
    element: {
      id, type: body.type, name: body.name,
      description: body.description, external: body.external ?? false,
      parentId: body.parentId ?? null, updatedAt: now,
    },
  }, { status: 201 });
}

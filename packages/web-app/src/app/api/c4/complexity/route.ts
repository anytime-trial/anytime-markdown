import type { MessageInput } from "@anytime-markdown/trail-core/c4";
import { computeComplexityMatrix, fetchC4Model } from "@anytime-markdown/trail-core/c4";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createC4ModelStore,NO_STORE_HEADERS } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';

/**
 * GET /api/c4/complexity?repo=...
 *
 * 拡張機能の complexity-updated WebSocket メッセージと互換。
 * Supabase の trail_messages（type='assistant'）を全件取得し、
 * computeComplexityMatrix で ComplexityMatrix を計算して返す。
 *
 * Complexity は累積指標のため release パラメータは受け取らない
 * (古いクライアントが付与しても無視する)。
 *
 * 返却形状: { complexityMatrix: ComplexityMatrix } | 204 No Content
 */

type RpcRow = {
  output_tokens: number | null;
  tool_names: string[] | null;
  edited_file_paths: string[] | null;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
  const repoParam = request.nextUrl.searchParams.get("repo") ?? undefined;

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse(null, { status: 204 });

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const supabase = createClient(env.url, env.anonKey);

    let repo = repoParam;
    if (!repo) {
      const { data } = await supabase
        .from('trail_current_graphs')
        .select('repo_name')
        .order('repo_name', { ascending: true })
        .limit(1)
        .maybeSingle<{ repo_name: string }>();
      if (data?.repo_name) repo = data.repo_name;
    }

    // get_complexity_tool_summary RPC: DB 側で tool_calls JSON を展開し
    // ツール名・ファイルパスのみ返す。old_string/content 等の大容量フィールドを
    // 転送しないため Netlify 関数の OOM を防止する。
    const [payload, rpcResult] = await Promise.all([
      fetchC4Model(store, 'current', repo),
      supabase.rpc('get_complexity_tool_summary'),
    ]);

    if (rpcResult.error) {
      console.error('[/api/c4/complexity] rpc failed:', rpcResult.error.message);
      return new NextResponse(null, { status: 204 });
    }

    const elements = payload?.model.elements ?? [];

    const messages: MessageInput[] = (rpcResult.data as RpcRow[] ?? []).map((row) => ({
      outputTokens: Number(row.output_tokens ?? 0),
      toolCallNames: row.tool_names ?? [],
      editedFilePaths: row.edited_file_paths ?? [],
    }));

    const complexityMatrix = computeComplexityMatrix(messages, elements);
    return NextResponse.json({ complexityMatrix }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/complexity] error', e);
    return new NextResponse(null, { status: 204 });
  }
}

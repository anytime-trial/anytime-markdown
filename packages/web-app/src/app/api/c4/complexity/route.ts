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
export async function GET(request: NextRequest): Promise<NextResponse> {
  const repoParam = request.nextUrl.searchParams.get("repo") ?? undefined;

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse(null, { status: 204 });

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const supabase = createClient(env.url, env.anonKey);

    // クライアントが selectedRepo='' の状態で叩くと repo パラメータが付かず、
    // fetchC4Model('current', undefined) が null になり elements 空 → entries 空。
    // VS Code 拡張は gitRoot から repo を補完しているため、
    // Web アプリでも trail_current_graphs から最初の repo に fallback する。
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

    // Supabase の Postgres API はデフォルトで 1000 行制限のため、
    // tool_calls を含む assistant メッセージを全件取得するためにページネーションする
    // (拡張機能の TrailDataServer は trail.db を直接全件読むため制限を受けない)。
    type MessageRow = { tool_calls: string | null; output_tokens: number | null };
    async function fetchAllAssistantMessages(): Promise<MessageRow[]> {
      const out: MessageRow[] = [];
      const PAGE = 1000;
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await supabase
          .from('trail_messages')
          .select('tool_calls, output_tokens')
          .eq('type', 'assistant')
          .not('tool_calls', 'is', null)
          .range(offset, offset + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        out.push(...(data as MessageRow[]));
        if (data.length < PAGE) break;
      }
      return out;
    }

    const [payload, messageRows] = await Promise.all([
      fetchC4Model(store, 'current', repo),
      fetchAllAssistantMessages().catch((err) => {
        console.error('[/api/c4/complexity] trail_messages query failed:', err);
        return null;
      }),
    ]);

    if (messageRows === null) {
      return new NextResponse(null, { status: 204 });
    }

    // C4 モデルが取得できない場合は空の elements でフォールバック（items は enabled になる）
    const elements = payload?.model.elements ?? [];

    const messages: MessageInput[] = messageRows.map(row => {
      let toolCallNames: string[] = [];
      let editedFilePaths: string[] = [];
      if (row.tool_calls) {
        try {
          const calls = JSON.parse(String(row.tool_calls)) as { name?: string; input?: Record<string, unknown> }[];
          if (Array.isArray(calls)) {
            toolCallNames = calls.map(c => c.name ?? '').filter(Boolean);
            editedFilePaths = calls
              .filter(c => c.name === 'Edit' || c.name === 'Write')
              .map(c => (typeof c.input?.file_path === 'string' ? c.input.file_path : ''))
              .filter(Boolean);
          }
        } catch {
          // malformed tool_calls — skip
        }
      }
      return { outputTokens: Number(row.output_tokens), toolCallNames, editedFilePaths };
    });

    const complexityMatrix = computeComplexityMatrix(messages, elements);
    return NextResponse.json({ complexityMatrix }, { headers: NO_STORE_HEADERS });
  } catch (e) {
    console.error('[/api/c4/complexity] error', e);
    return new NextResponse(null, { status: 204 });
  }
}

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { computeComplexityMatrix, fetchC4Model } from "@anytime-markdown/trail-core/c4";
import type { MessageInput } from "@anytime-markdown/trail-core/c4";

import { NO_STORE_HEADERS, createC4ModelStore } from "../../../../lib/api-helpers";
import { resolveSupabaseEnv } from "../../../../lib/supabase-env";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/c4/complexity?release=...&repo=...
 *
 * 拡張機能の complexity-updated WebSocket メッセージと互換。
 * Supabase の trail_messages（type='assistant'）を全件取得し、
 * computeComplexityMatrix で ComplexityMatrix を計算して返す。
 *
 * 返却形状: { complexityMatrix: ComplexityMatrix } | 204 No Content
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const release = request.nextUrl.searchParams.get("release") ?? "current";
  const repo = request.nextUrl.searchParams.get("repo") ?? undefined;

  const env = resolveSupabaseEnv();
  if (!env) return new NextResponse(null, { status: 204 });

  const store = createC4ModelStore();
  if (!store) return new NextResponse(null, { status: 204 });

  try {
    const supabase = createClient(env.url, env.anonKey);
    const [payload, messagesResult] = await Promise.all([
      fetchC4Model(store, release, repo),
      supabase
        .from('trail_messages')
        .select('tool_calls, output_tokens')
        .eq('type', 'assistant')
        .not('tool_calls', 'is', null),
    ]);

    if (messagesResult.error) {
      console.error('[/api/c4/complexity] trail_messages query failed:', messagesResult.error.message);
      return new NextResponse(null, { status: 204 });
    }

    // C4 モデルが取得できない場合は空の elements でフォールバック（items は enabled になる）
    const elements = payload?.model.elements ?? [];

    const messages: MessageInput[] = (messagesResult.data ?? []).map(row => {
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

// packages/web-app/src/lib/supabase-env.ts
//
// Supabase 接続情報を環境変数から解決する。server / client どちらから呼ばれても動くよう、
// NEXT_PUBLIC_ 接頭辞付きの変数にもフォールバックする。

export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

export interface SupabaseServiceEnv {
  readonly url: string;
  readonly serviceRoleKey: string;
}

function resolveUrl(): string {
  return process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
}

export function resolveSupabaseEnv(): SupabaseEnv | null {
  const url = resolveUrl();
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

// 書き込み (C4 編集 API ルート) 用。service_role キーは RLS をバイパスする秘匿情報のため、
// NEXT_PUBLIC_ フォールバックを持たせない (ブラウザバンドルへの流出を防ぐ)。サーバ env のみ参照する。
export function resolveSupabaseServiceEnv(): SupabaseServiceEnv | null {
  const url = resolveUrl();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

// packages/web-app/src/lib/supabase-env.ts
//
// Supabase 接続情報を環境変数から解決する。server / client どちらから呼ばれても動くよう、
// NEXT_PUBLIC_ 接頭辞付きの変数にもフォールバックする。

export interface SupabaseEnv {
  readonly url: string;
  readonly anonKey: string;
}

export function resolveSupabaseEnv(): SupabaseEnv | null {
  const url =
    process.env.SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL ??
    '';
  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    '';
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

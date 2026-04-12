import { NextResponse } from 'next/server';

// web-app は Supabase モードで動作するため、リリース一覧は SupabaseTrailReader 経由で取得される。
// このルートは非 Supabase モードのフォールバックとして空配列を返す。
export async function GET(): Promise<NextResponse> {
  return NextResponse.json([]);
}

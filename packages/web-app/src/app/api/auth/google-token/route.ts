import { NextResponse } from "next/server";

import { getGoogleToken } from "../../../../lib/githubAuth";

/**
 * 現在セッションの Google OAuth アクセストークンを返す軽量ルート。
 * クライアント側（Google Picker）が Drive スコープ付きトークンを必要とするための橋渡し。
 * 未認証時は 401。
 */
export async function GET(): Promise<NextResponse> {
  const token = await getGoogleToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return NextResponse.json({ accessToken: token });
}

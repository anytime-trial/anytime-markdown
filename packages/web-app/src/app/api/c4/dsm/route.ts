import { NextResponse } from "next/server";

/**
 * GET /api/c4/dsm
 *
 * 拡張機能の /api/c4/dsm と互換。
 * web アプリは read-only かつ DSM のソース（TrailGraph）を保持しないため、
 * 現状は 204 No Content を返す。C4ViewerCore 側は dsmMatrix=null で DSM タブを空状態にする。
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(): Promise<NextResponse> {
  return new NextResponse(null, { status: 204 });
}

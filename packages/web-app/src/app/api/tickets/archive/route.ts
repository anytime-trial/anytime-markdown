import { type NextRequest, NextResponse } from "next/server";

import { resolveTicketProviderFromBody, ticketErrorResponse } from "../helpers";

/** チケットをアーカイブする（version 楽観ロック。プロバイダごとの表現は provider 実装に従う） */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const provider = await resolveTicketProviderFromBody(body);
  if (provider instanceof NextResponse) {
    return provider;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const version = typeof body.version === "string" ? body.version : "";
  if (path === "" || version === "") {
    return NextResponse.json({ error: "path / version が不正です" }, { status: 400 });
  }
  try {
    const result = await provider.archive({ path, version });
    return NextResponse.json(result);
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

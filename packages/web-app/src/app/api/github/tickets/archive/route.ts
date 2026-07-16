import { type NextRequest, NextResponse } from "next/server";

import { archiveTicket } from "@anytime-markdown/tickets-core";

import { fetchWithRetry } from "../../../../../lib/fetchWithRetry";
import { resolveRepoParams, ticketErrorResponse } from "../helpers";

/** completed チケットを `.tickets/archive/` へ移動する */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as Record<string, unknown>;
  const params = await resolveRepoParams(
    typeof body.repo === "string" ? body.repo : null,
    typeof body.branch === "string" ? body.branch : null,
  );
  if (params instanceof NextResponse) {
    return params;
  }
  const path = typeof body.path === "string" ? body.path : "";
  const sha = typeof body.sha === "string" ? body.sha : "";
  if (path === "" || sha === "") {
    return NextResponse.json({ error: "path / sha が不正です" }, { status: 400 });
  }
  try {
    const result = await archiveTicket({ ...params, fetchFn: fetchWithRetry, input: { path, sha } });
    return NextResponse.json(result);
  } catch (error) {
    return ticketErrorResponse(error);
  }
}

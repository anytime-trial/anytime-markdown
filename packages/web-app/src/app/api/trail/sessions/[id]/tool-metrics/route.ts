import type { NextResponse } from "next/server";
import { trailReaderRoute } from "../../../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return trailReaderRoute(
    (r) => r.getSessionToolMetrics(id),
    null,
    `/api/trail/sessions/${id}/tool-metrics`,
  );
}

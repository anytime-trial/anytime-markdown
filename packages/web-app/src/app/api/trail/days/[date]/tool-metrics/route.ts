import type { NextResponse } from "next/server";
import { trailReaderRoute } from "../../../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ date: string }> },
): Promise<NextResponse> {
  const { date } = await params;
  return trailReaderRoute(
    (r) => r.getDayToolMetrics(date),
    null,
    `/api/trail/days/${date}/tool-metrics`,
  );
}

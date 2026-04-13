import { NextResponse } from "next/server";
import { trailReaderRoute } from "../../../../../../lib/api-helpers";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  return trailReaderRoute(
    async (r) => ({ commits: await r.getSessionCommits(id) }),
    { commits: [] },
    `/api/trail/sessions/${id}/commits`,
  );
}

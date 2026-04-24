import { NextResponse } from 'next/server';

import { trailReaderRoute } from '../../../../../lib/api-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }
  return trailReaderRoute(
    async (r) => ({ messages: await r.getMessages(id) }),
    { messages: [] },
    `/api/trail/sessions/${id}`,
  );
}

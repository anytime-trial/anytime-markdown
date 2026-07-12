import * as fs from 'node:fs';
import * as path from 'node:path';

import { NextResponse } from 'next/server';

import { getTraceDir } from '../_utils';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse('Not available in production', { status: 403 });
  }

  const url = new URL(request.url);
  const name = url.searchParams.get('name');
  if (!name || name.includes('..') || name.includes('/') || !name.endsWith('.json')) {
    return new NextResponse('Invalid file name', { status: 400 });
  }

  const filePath = path.join(getTraceDir(), name);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return new NextResponse('File not found', { status: 404 });
    const safePath = filePath.replaceAll(/[\r\n]/g, '↵');
    console.error(`[${new Date().toISOString()}] [ERROR] trace/file GET failed: %s`, safePath, err);
    return new NextResponse('Failed to read file', { status: 500 });
  }
}

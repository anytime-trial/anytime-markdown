import { NextRequest, NextResponse } from 'next/server';

const CMS_USER = process.env.CMS_BASIC_USER ?? '';
const CMS_PASSWORD = process.env.CMS_BASIC_PASSWORD ?? '';

/**
 * Basic 認証を検証する。
 * 認証失敗時は 401 レスポンスを返す。成功時は null を返す。
 */
export function checkBasicAuth(request: NextRequest): NextResponse | null {
  if (!CMS_USER || !CMS_PASSWORD) {
    return NextResponse.json(
      { error: 'CMS authentication is not configured' },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Basic ')) {
    return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="CMS"',
        'Content-Type': 'application/json',
      },
    });
  }

  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
  const [user, password] = decoded.split(':');

  if (user !== CMS_USER || password !== CMS_PASSWORD) {
    return new NextResponse(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="CMS"',
        'Content-Type': 'application/json',
      },
    });
  }

  return null;
}

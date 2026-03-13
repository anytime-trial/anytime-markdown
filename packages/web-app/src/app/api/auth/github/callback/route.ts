import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing code" }, { status: 400 });
  }
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const { access_token, error } = await tokenRes.json();
  if (error || !access_token) {
    return NextResponse.json(
      { error: error ?? "Token exchange failed" },
      { status: 400 },
    );
  }
  const response = NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/markdown`,
  );
  response.cookies.set("github_token", access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return response;
}

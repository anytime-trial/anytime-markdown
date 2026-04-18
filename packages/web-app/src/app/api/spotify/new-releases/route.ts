import { NextResponse } from "next/server";
import { getClientCredentialsToken } from "../../../../lib/spotify";

export async function GET() {
  try {
    const token = await getClientCredentialsToken();

    const res = await fetch(
      "https://api.spotify.com/v1/browse/new-releases?market=JP&limit=20",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Spotify API error" }, { status: res.status });
    }

    const data = (await res.json()) as {
      albums: {
        items: {
          id: string;
          name: string;
          uri: string;
          artists: { name: string }[];
          images: { url: string; width: number; height: number }[];
        }[];
      };
    };

    return NextResponse.json({ albums: data.albums.items });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

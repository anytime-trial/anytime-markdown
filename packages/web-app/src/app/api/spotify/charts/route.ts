import { NextResponse } from "next/server";

import type { SpotifyTrack } from "../../../../lib/spotify";
import { getClientCredentialsToken } from "../../../../lib/spotify";

export async function GET() {
  try {
    const token = await getClientCredentialsToken();

    const res = await fetch(
      "https://api.spotify.com/v1/browse/featured-playlists?market=JP&limit=1",
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "Spotify API error" }, { status: res.status });
    }

    const data = (await res.json()) as {
      playlists: { items: { id: string }[] };
    };

    const playlistId = data.playlists.items[0]?.id;
    if (!playlistId) {
      return NextResponse.json({ tracks: [] });
    }

    const tracksRes = await fetch(
      `https://api.spotify.com/v1/playlists/${playlistId}/tracks?market=JP&limit=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!tracksRes.ok) {
      return NextResponse.json({ error: "Spotify API error" }, { status: tracksRes.status });
    }

    const tracksData = (await tracksRes.json()) as {
      items: { track: SpotifyTrack }[];
    };

    const tracks = tracksData.items.map((item) => item.track).filter(Boolean);

    return NextResponse.json({ tracks });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";

import { getSpotifyToken } from "../../../../lib/githubAuth";
import { chunkArray } from "../../../../lib/spotify";

interface CreatePlaylistBody {
  name: string;
  trackUris: string[];
}

export async function POST(req: NextRequest) {
  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreatePlaylistBody;
  const { name, trackUris } = body;

  if (!name || !trackUris || trackUris.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const meRes = await fetch("https://api.spotify.com/v1/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meRes.ok) {
    return NextResponse.json({ error: "Failed to get user" }, { status: meRes.status });
  }
  const me = (await meRes.json()) as { id: string };

  const createRes = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, public: false }),
  });
  if (!createRes.ok) {
    return NextResponse.json(
      { error: "Failed to create playlist" },
      { status: createRes.status }
    );
  }
  const playlist = (await createRes.json()) as {
    id: string;
    external_urls: { spotify: string };
  };

  const chunks = chunkArray(trackUris, 100);
  for (const chunk of chunks) {
    const addRes = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris: chunk }),
    });
    if (!addRes.ok) {
      return NextResponse.json({ error: "Failed to add tracks" }, { status: addRes.status });
    }
  }

  return NextResponse.json({
    playlistId: playlist.id,
    spotifyUrl: playlist.external_urls.spotify,
  });
}

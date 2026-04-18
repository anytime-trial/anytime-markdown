import { NextRequest, NextResponse } from "next/server";
import { getYouTubeToken } from "../../../../lib/githubAuth";

interface CreatePlaylistBody {
  name: string;
  videoIds: string[];
}

export async function POST(req: NextRequest) {
  const token = await getYouTubeToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as CreatePlaylistBody;
  const { name, videoIds } = body;

  if (!name || !videoIds || videoIds.length === 0) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const createRes = await fetch(
    "https://www.googleapis.com/youtube/v3/playlists?part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: { title: name, defaultLanguage: "ja" },
        status: { privacyStatus: "private" },
      }),
    }
  );
  if (!createRes.ok) {
    return NextResponse.json({ error: "Failed to create playlist" }, { status: createRes.status });
  }
  const playlist = (await createRes.json()) as { id: string };

  for (const videoId of videoIds) {
    const addRes = await fetch(
      "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          snippet: {
            playlistId: playlist.id,
            resourceId: { kind: "youtube#video", videoId },
          },
        }),
      }
    );
    if (!addRes.ok) {
      return NextResponse.json({ error: "Failed to add video" }, { status: addRes.status });
    }
  }

  return NextResponse.json({
    playlistId: playlist.id,
    youtubeUrl: `https://www.youtube.com/playlist?list=${playlist.id}`,
  });
}

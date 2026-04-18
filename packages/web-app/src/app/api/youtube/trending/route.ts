import { NextResponse } from "next/server";
import type { YouTubeVideo } from "../../../../lib/youtube";

export async function GET() {
  try {
    const apiKey = process.env.YOUTUBE_API_KEY ?? "";
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("videoCategoryId", "10"); // Music
    url.searchParams.set("regionCode", "JP");
    url.searchParams.set("maxResults", "50");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return NextResponse.json({ error: "YouTube API error" }, { status: res.status });
    }

    const data = (await res.json()) as {
      items: {
        id: string;
        snippet: {
          title: string;
          channelTitle: string;
          thumbnails: { medium: { url: string } };
        };
      }[];
    };

    const videos: YouTubeVideo[] = data.items.map((item) => ({
      id: item.id,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnailUrl: item.snippet.thumbnails.medium.url,
    }));

    return NextResponse.json({ videos });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

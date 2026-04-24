import { NextResponse } from "next/server";

import type { OembedData } from "@anytime-markdown/markdown-core/src/types/embedProvider";
import { sanitizeTweetHtml } from "@anytime-markdown/markdown-core/src/utils/tweetSanitize";

const TIMEOUT_MS = 5000;
const ALLOWED_TWITTER_HOSTS = new Set(["twitter.com", "x.com", "www.twitter.com", "www.x.com"]);

export async function GET(req: Request): Promise<Response> {
    const raw = new URL(req.url).searchParams.get("url");
    if (!raw) return new NextResponse("missing url", { status: 400 });

    let u: URL;
    try {
        u = new URL(raw);
    } catch {
        return new NextResponse("invalid url", { status: 400 });
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
        return new NextResponse("rejected: scheme", { status: 400 });
    }
    if (!ALLOWED_TWITTER_HOSTS.has(u.hostname)) {
        return new NextResponse("rejected: host", { status: 400 });
    }

    const endpoint = new URL("https://publish.twitter.com/oembed");
    endpoint.searchParams.set("url", u.toString());
    endpoint.searchParams.set("omit_script", "true");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(endpoint.toString(), {
            signal: controller.signal,
            headers: { "User-Agent": "anytime-markdown-oembed/1.0" },
        });
        if (!res.ok) return new NextResponse("upstream error", { status: 502 });
        const body = (await res.json()) as { html?: string; author_name?: string };
        if (typeof body.html !== "string") {
            return new NextResponse("no html", { status: 502 });
        }
        const payload: OembedData = {
            url: u.toString(),
            provider: "twitter",
            html: sanitizeTweetHtml(body.html),
            authorName: body.author_name ?? null,
        };
        return NextResponse.json(payload);
    } catch (e) {
        const msg = (e as Error).name === "AbortError" ? "timeout" : "fetch-failed";
        const status = msg === "timeout" ? 504 : 502;
        return new NextResponse(msg, { status });
    } finally {
        clearTimeout(timer);
    }
}

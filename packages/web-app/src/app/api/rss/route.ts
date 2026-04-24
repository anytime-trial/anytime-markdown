import { NextResponse } from "next/server";

import { parseRssLatest } from "@anytime-markdown/markdown-core/src/utils/rssParser";
import { assertSafeUrl } from "@anytime-markdown/markdown-core/src/utils/ssrfGuard";

const TIMEOUT_MS = 10000;
const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: Request): Promise<Response> {
    const url = new URL(req.url).searchParams.get("url");
    if (!url) return new NextResponse("missing url", { status: 400 });

    try {
        await assertSafeUrl(url);
    } catch (e) {
        return new NextResponse(`rejected: ${(e as Error).message}`, { status: 400 });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "User-Agent": "anytime-markdown-rss/1.0" },
            redirect: "follow",
        });
        if (!res.ok) return new NextResponse(`upstream-${res.status}`, { status: 502 });

        const reader = res.body?.getReader();
        if (!reader) return new NextResponse("no body", { status: 502 });
        const chunks: Uint8Array[] = [];
        let total = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) {
                void reader.cancel();
                return new NextResponse("too-large", { status: 413 });
            }
            chunks.push(value);
        }
        const xml = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
        const parsed = parseRssLatest(xml);
        if (!parsed) return new NextResponse("parse-failed", { status: 422 });
        return NextResponse.json(parsed);
    } catch (e) {
        const msg = (e as Error).name === "AbortError" ? "timeout" : "fetch-failed";
        const status = msg === "timeout" ? 504 : 502;
        return new NextResponse(msg, { status });
    } finally {
        clearTimeout(timer);
    }
}

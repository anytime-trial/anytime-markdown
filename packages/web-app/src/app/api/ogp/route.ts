import { NextResponse } from "next/server";

import { parseOgpHtml } from "@anytime-markdown/markdown-core/src/utils/ogpParser";
import { assertSafeUrl } from "@anytime-markdown/markdown-core/src/utils/ssrfGuard";

const TIMEOUT_MS = 5000;
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
            headers: { "User-Agent": "anytime-markdown-ogp/1.0" },
        });
        if (!res.ok) return new NextResponse("upstream error", { status: 502 });
        const ct = res.headers.get("content-type") ?? "";
        if (!ct.includes("html")) return new NextResponse("unsupported content", { status: 415 });

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
                break;
            }
            chunks.push(value);
        }
        const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
        return NextResponse.json(parseOgpHtml(html, url));
    } catch (e) {
        const msg = (e as Error).name === "AbortError" ? "timeout" : "fetch-failed";
        const status = msg === "timeout" ? 504 : 502;
        return new NextResponse(msg, { status });
    } finally {
        clearTimeout(timer);
    }
}

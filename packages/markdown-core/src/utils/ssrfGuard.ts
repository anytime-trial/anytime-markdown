export function isPrivateAddress(ip: string): boolean {
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (v4) {
        const a = Number(v4[1]);
        const b = Number(v4[2]);
        if (a === 0) return true;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }
    const lower = ip.toLowerCase();
    if (lower === "::1") return true;
    if (/^fc[0-9a-f]{2}:/.test(lower) || /^fd[0-9a-f]{2}:/.test(lower)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    return false;
}

export async function assertSafeUrl(url: string): Promise<void> {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("scheme-not-allowed");
    }
    const { lookup } = await import("node:dns/promises");
    const records = await lookup(u.hostname, { all: true });
    for (const r of records) {
        if (isPrivateAddress(r.address)) throw new Error("private-address");
    }
}

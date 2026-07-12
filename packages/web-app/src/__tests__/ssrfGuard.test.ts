import { assertSafeUrl, isPrivateAddress, safeFetch } from "../lib/ssrfGuard";

jest.mock("node:dns/promises", () => ({
    lookup: jest.fn(),
}));

import { lookup } from "node:dns/promises";
const mockLookup = lookup as jest.MockedFunction<typeof lookup>;

describe("isPrivateAddress", () => {
    test.each([
        "127.0.0.1", "10.0.0.1", "10.255.255.255",
        "172.16.0.1", "172.31.255.255",
        "192.168.0.1", "192.168.255.255",
        "169.254.169.254", "0.0.0.0",
        "::1", "fc00::1", "fe80::1",
    ])("private %s", (ip) => {
        expect(isPrivateAddress(ip)).toBe(true);
    });

    test.each([
        "8.8.8.8", "1.1.1.1", "172.15.255.255", "172.32.0.1",
        "2606:4700:4700::1111",
    ])("public %s", (ip) => {
        expect(isPrivateAddress(ip)).toBe(false);
    });
});

describe("assertSafeUrl", () => {
    beforeEach(() => jest.clearAllMocks());

    test("rejects non-http/https schemes", async () => {
        await expect(assertSafeUrl("ftp://example.com/file")).rejects.toThrow("scheme-not-allowed");
        await expect(assertSafeUrl("javascript:alert(1)")).rejects.toThrow("scheme-not-allowed");
    });

    test("accepts https URL resolving to public IP", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        await expect(assertSafeUrl("https://dns.google")).resolves.toBeUndefined();
    });

    test("rejects URL resolving to private IP", async () => {
        mockLookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }] as never);
        await expect(assertSafeUrl("https://internal.example.com")).rejects.toThrow("private-address");
    });

    test("rejects URL resolving to loopback", async () => {
        mockLookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
        await expect(assertSafeUrl("http://localhost")).rejects.toThrow("private-address");
    });

    test("rejects if any resolved address is private", async () => {
        mockLookup.mockResolvedValue([
            { address: "8.8.8.8", family: 4 },
            { address: "192.168.1.1", family: 4 },
        ] as never);
        await expect(assertSafeUrl("https://mixed.example.com")).rejects.toThrow("private-address");
    });
});

describe("safeFetch", () => {
    const mockFetch = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = mockFetch as unknown as typeof fetch;
    });

    function redirectTo(location: string): Response {
        return {
            status: 302,
            headers: { get: (name: string) => (name.toLowerCase() === "location" ? location : null) },
        } as unknown as Response;
    }

    function ok(): Response {
        return { status: 200, ok: true, headers: { get: () => null } } as unknown as Response;
    }

    test("resolves the final response and never follows redirects implicitly", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        mockFetch.mockResolvedValue(ok());

        const res = await safeFetch("https://example.com/feed");

        expect(res.status).toBe(200);
        expect(mockFetch).toHaveBeenCalledWith("https://example.com/feed", expect.objectContaining({ redirect: "manual" }));
    });

    test("rejects a redirect that points at a private address", async () => {
        mockLookup.mockImplementation(async (hostname: string) =>
            (hostname === "example.com"
                ? [{ address: "8.8.8.8", family: 4 }]
                : [{ address: "169.254.169.254", family: 4 }]) as never,
        );
        mockFetch.mockResolvedValueOnce(redirectTo("http://metadata.internal/latest/meta-data/"));

        await expect(safeFetch("https://example.com/feed")).rejects.toThrow("private-address");
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("validates every hop of an allowed redirect chain", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        mockFetch.mockResolvedValueOnce(redirectTo("https://cdn.example.com/feed")).mockResolvedValueOnce(ok());

        const res = await safeFetch("https://example.com/feed");

        expect(res.status).toBe(200);
        expect(mockLookup).toHaveBeenCalledTimes(2);
    });

    test("rejects redirect loops beyond the hop limit", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        mockFetch.mockResolvedValue(redirectTo("https://example.com/feed"));

        await expect(safeFetch("https://example.com/feed")).rejects.toThrow("too-many-redirects");
    });

    test("rejects a redirect without a Location header", async () => {
        mockLookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }] as never);
        mockFetch.mockResolvedValue({ status: 302, headers: { get: () => null } } as unknown as Response);

        await expect(safeFetch("https://example.com/feed")).rejects.toThrow("redirect-without-location");
    });
});

// Polyfill TextEncoder / TextDecoder for jsdom (they exist only in Node global scope).
import { TextDecoder, TextEncoder } from "node:util";

if (typeof globalThis.TextEncoder === "undefined") {
    (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
    (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

// Polyfill Web Crypto API subtle.digest using Node's crypto module for SHA-256 support under jsdom.
if (!globalThis.crypto?.subtle) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { webcrypto } = require("node:crypto") as { webcrypto: Crypto };
    Object.defineProperty(globalThis, "crypto", {
        configurable: true,
        enumerable: true,
        get: () => webcrypto,
    });
}

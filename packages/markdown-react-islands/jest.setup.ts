// Polyfill TextEncoder / TextDecoder for jsdom (they exist only in Node global scope).
import { TextDecoder, TextEncoder } from "node:util";

if (typeof globalThis.TextEncoder === "undefined") {
    (globalThis as unknown as { TextEncoder: typeof TextEncoder }).TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
    (globalThis as unknown as { TextDecoder: typeof TextDecoder }).TextDecoder = TextDecoder;
}

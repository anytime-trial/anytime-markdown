/**
 * fileReading.ts - カバレッジテスト (lines 33-45)
 * readFileAsText: UTF-8, UTF-16 LE, UTF-16 BE, BOM handling
 */
import { TextEncoder, TextDecoder } from "util";

Object.assign(globalThis, { TextEncoder, TextDecoder });

// Polyfill File.prototype.arrayBuffer for jsdom
if (!File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function () {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

import { readFileAsText } from "../utils/fileReading";

describe("readFileAsText coverage", () => {
  it("reads UTF-8 file without BOM", async () => {
    const content = "Hello, World!\nSecond line\n";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(content).buffer;
    const file = new File([buffer], "test.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe(content);
    expect(result.encoding).toBe("UTF-8");
    expect(result.lineEnding).toBe("LF");
  });

  it("reads UTF-8 file with BOM", async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const content = new TextEncoder().encode("BOM content\n");
    const combined = new Uint8Array([...bom, ...content]);
    const file = new File([combined.buffer], "bom.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("BOM content\n");
    expect(result.encoding).toBe("UTF-8 (BOM)");
  });

  it("reads UTF-16 LE file", async () => {
    // UTF-16 LE BOM + "AB"
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42, 0x00]);
    const file = new File([bytes.buffer], "le.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("AB");
    expect(result.encoding).toBe("UTF-16 LE");
  });

  it("reads UTF-16 BE file", async () => {
    // UTF-16 BE BOM + "AB"
    const bytes = new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x00, 0x42]);
    const file = new File([bytes.buffer], "be.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("AB");
    expect(result.encoding).toBe("UTF-16 BE");
  });

  it("normalizes CRLF to LF", async () => {
    const content = "line1\r\nline2\r\n";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(content).buffer;
    const file = new File([buffer], "crlf.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("line1\nline2\n");
    expect(result.lineEnding).toBe("CRLF");
  });

  it("normalizes CR to LF", async () => {
    const content = "line1\rline2\r";
    const encoder = new TextEncoder();
    const buffer = encoder.encode(content).buffer;
    const file = new File([buffer], "cr.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("line1\nline2\n");
    expect(result.lineEnding).toBe("CR");
  });

  it("handles empty file", async () => {
    const file = new File([], "empty.md", { type: "text/plain" });

    const result = await readFileAsText(file);
    expect(result.text).toBe("");
    expect(result.encoding).toBe("UTF-8");
    expect(result.lineEnding).toBe("N/A");
  });
});

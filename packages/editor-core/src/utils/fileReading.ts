export interface ReadFileResult {
  text: string;
  encoding: string;
  lineEnding: string;
}

export function detectEncoding(buffer: ArrayBuffer): { encoding: string; bomLength: number } {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "UTF-8 (BOM)", bomLength: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "UTF-16 LE", bomLength: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "UTF-16 BE", bomLength: 2 };
  }
  return { encoding: "UTF-8", bomLength: 0 };
}

export function detectLineEnding(text: string): string {
  const crlf = (text.match(/\r\n/g) || []).length;
  const lf = (text.match(/(?<!\r)\n/g) || []).length;
  const cr = (text.match(/\r(?!\n)/g) || []).length;
  if (crlf === 0 && lf === 0 && cr === 0) return "N/A";
  if (crlf > 0 && lf === 0 && cr === 0) return "CRLF";
  if (lf > 0 && crlf === 0 && cr === 0) return "LF";
  if (cr > 0 && crlf === 0 && lf === 0) return "CR";
  return "Mixed";
}

export function readFileAsText(file: File): Promise<ReadFileResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) return;
      const buffer = reader.result;
      const { encoding, bomLength } = detectEncoding(buffer);
      let text: string;
      if (encoding.startsWith("UTF-16 LE")) {
        text = new TextDecoder("utf-16le").decode(buffer.slice(bomLength));
      } else if (encoding.startsWith("UTF-16 BE")) {
        text = new TextDecoder("utf-16be").decode(buffer.slice(bomLength));
      } else {
        text = new TextDecoder("utf-8").decode(buffer.slice(bomLength));
      }
      const lineEnding = detectLineEnding(text);
      const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      resolve({ text: normalized, encoding, lineEnding });
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

import * as http from 'http';
import type { AddressInfo } from 'net';

export interface MockResponse {
  /** JSON string returned as the `response` field by POST /api/generate */
  generate: string;
  /** 1024-length embedding array for POST /api/embeddings (default: zeros) */
  embed?: number[];
}

export interface MockOllamaServer {
  baseUrl: string;
  setResponses(responses: MockResponse[]): void;
  close(): Promise<void>;
}

/**
 * Starts an in-process HTTP server that mimics Ollama's /api/generate and
 * /api/embeddings endpoints.
 *
 * POST /api/generate  — dequeues the next `generate` string from the queue
 *                        and returns { response: <string> }.
 * POST /api/embeddings — always returns { embedding: <embedVector> } (1024-dim).
 *
 * Both request bodies are consumed but not validated.
 */
export async function startMockOllama(): Promise<MockOllamaServer> {
  let generateQueue: string[] = [];
  let embedVector: number[] = new Array(1024).fill(0);

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');

      if (req.method === 'POST' && req.url === '/api/generate') {
        if (generateQueue.length === 0) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'mock: generateQueue is empty' }));
          return;
        }
        const next = generateQueue.shift() as string;
        res.writeHead(200);
        res.end(JSON.stringify({ response: next }));
        return;
      }

      if (req.method === 'POST' && req.url === '/api/embeddings') {
        res.writeHead(200);
        res.end(JSON.stringify({ embedding: embedVector }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: `mock: unknown route ${req.url}` }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

  const addr = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,

    setResponses(responses: MockResponse[]): void {
      generateQueue = responses.map((r) => r.generate);
      embedVector = responses[0]?.embed ?? new Array(1024).fill(0);
    },

    close(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
  };
}

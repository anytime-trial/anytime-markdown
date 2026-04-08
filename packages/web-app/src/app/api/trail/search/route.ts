import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  readonly sessionId: string;
  readonly project: string;
  readonly snippet: string;
  readonly lineNumber: number;
}

/** Minimal shape for reading JSONL lines */
interface JsonlLine {
  readonly sessionId?: string;
  readonly message?: { readonly content?: string };
  readonly userContent?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const MAX_RESULTS = 50;
const SNIPPET_CONTEXT = 120;

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q');

  if (!q || q.trim() === '') {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const searchText = q.toLowerCase();
  const results: SearchResult[] = [];

  try {
    let projectDirs: string[];
    try {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return NextResponse.json([]);
    }

    for (const projDir of projectDirs) {
      if (results.length >= MAX_RESULTS) break;

      const projPath = join(PROJECTS_DIR, projDir);
      let files: string[];
      try {
        const entries = await readdir(projPath);
        files = entries.filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        if (results.length >= MAX_RESULTS) break;

        const filePath = join(projPath, file);
        let content: string;
        try {
          content = await readFile(filePath, 'utf-8');
        } catch {
          continue;
        }

        const lines = content.split('\n');
        let sessionId = '';

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= MAX_RESULTS) break;
          const line = lines[i];
          if (line.trim() === '') continue;

          // Extract sessionId from first valid line
          if (!sessionId) {
            try {
              const raw = JSON.parse(line) as JsonlLine;
              if (raw.sessionId) sessionId = raw.sessionId;
            } catch {
              continue;
            }
          }

          if (!line.toLowerCase().includes(searchText)) continue;

          // Extract a readable snippet
          let snippet = '';
          try {
            const raw = JSON.parse(line) as JsonlLine;
            const textSource =
              typeof raw.message?.content === 'string'
                ? raw.message.content
                : raw.userContent ?? line;
            const idx = textSource.toLowerCase().indexOf(searchText);
            if (idx >= 0) {
              const start = Math.max(0, idx - SNIPPET_CONTEXT / 2);
              const end = Math.min(textSource.length, idx + searchText.length + SNIPPET_CONTEXT / 2);
              snippet = (start > 0 ? '...' : '') + textSource.slice(start, end) + (end < textSource.length ? '...' : '');
            } else {
              snippet = textSource.slice(0, SNIPPET_CONTEXT);
            }
          } catch {
            const idx = line.toLowerCase().indexOf(searchText);
            const start = Math.max(0, idx - SNIPPET_CONTEXT / 2);
            const end = Math.min(line.length, idx + searchText.length + SNIPPET_CONTEXT / 2);
            snippet = line.slice(start, end);
          }

          results.push({
            sessionId: sessionId || file.replace('.jsonl', ''),
            project: projDir,
            snippet,
            lineNumber: i + 1,
          });
        }
      }
    }

    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

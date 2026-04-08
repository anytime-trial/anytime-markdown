import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionSummary {
  readonly id: string;
  readonly slug: string;
  readonly project: string;
  readonly gitBranch: string;
  readonly startTime: string;
  readonly endTime: string;
  readonly version: string;
  readonly model: string;
  readonly messageCount: number;
}

/** Minimal shape for reading JSONL metadata (avoids importing internal types) */
interface JsonlLine {
  readonly type?: string;
  readonly sessionId?: string;
  readonly slug?: string;
  readonly gitBranch?: string;
  readonly version?: string;
  readonly timestamp?: string;
  readonly message?: { readonly model?: string };
  readonly isMeta?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const HEAD_LINES = 20;

function countJsonlMessages(filePath: string): Promise<number> {
  return readFile(filePath, 'utf-8').then((content) => {
    let count = 0;
    for (const line of content.split('\n')) {
      if (line.trim() === '') continue;
      try {
        const raw = JSON.parse(line) as JsonlLine;
        if (raw.type === 'user' || raw.type === 'assistant' || raw.type === 'system') {
          count++;
        }
      } catch {
        // skip malformed
      }
    }
    return count;
  });
}

async function extractSessionMeta(
  filePath: string,
  projectName: string,
): Promise<SessionSummary | null> {
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }

  const lines = content.split('\n');
  const headLines = lines.slice(0, HEAD_LINES);

  let sessionId = '';
  let slug = '';
  let gitBranch = '';
  let version = '';
  let model = '';
  let startTime = '';

  for (const line of headLines) {
    if (line.trim() === '') continue;
    try {
      const raw = JSON.parse(line) as JsonlLine;

      if (!sessionId && raw.sessionId) sessionId = raw.sessionId;
      if (!slug && raw.slug) slug = raw.slug;
      if (!gitBranch && raw.gitBranch) gitBranch = raw.gitBranch;
      if (!version && raw.version) version = raw.version;
      if (!startTime && raw.timestamp) startTime = raw.timestamp;
      if (!model && raw.message?.model) model = raw.message.model;
    } catch {
      // skip malformed
    }
  }

  if (!sessionId) return null;

  // Get endTime from last non-empty line
  let endTime = '';
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim() === '') continue;
    try {
      const raw = JSON.parse(lines[i]) as JsonlLine;
      if (raw.timestamp) {
        endTime = raw.timestamp;
        break;
      }
    } catch {
      // skip
    }
  }

  // Count messages (lightweight scan)
  const messageCount = await countJsonlMessages(filePath);

  return {
    id: sessionId,
    slug,
    project: projectName,
    gitBranch,
    startTime,
    endTime,
    version,
    model,
    messageCount,
  };
}

function matchesFilter(
  session: SessionSummary,
  branch?: string,
  model?: string,
  project?: string,
  q?: string,
): boolean {
  if (branch && session.gitBranch !== branch) return false;
  if (model && session.model !== model) return false;
  if (project && session.project !== project) return false;
  if (q) {
    const lower = q.toLowerCase();
    const searchable = [
      session.slug,
      session.gitBranch,
      session.model,
      session.project,
    ]
      .join(' ')
      .toLowerCase();
    if (!searchable.includes(lower)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const branch = url.searchParams.get('branch') ?? undefined;
  const model = url.searchParams.get('model') ?? undefined;
  const project = url.searchParams.get('project') ?? undefined;
  const q = url.searchParams.get('q') ?? undefined;

  try {
    let projectDirs: string[];
    try {
      const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
      projectDirs = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return NextResponse.json([]);
    }

    const allSessions: SessionSummary[] = [];

    for (const projDir of projectDirs) {
      const projPath = join(PROJECTS_DIR, projDir);
      let files: string[];
      try {
        const entries = await readdir(projPath);
        files = entries.filter((f) => f.endsWith('.jsonl'));
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = join(projPath, file);
        const meta = await extractSessionMeta(filePath, projDir);
        if (meta && matchesFilter(meta, branch, model, project, q)) {
          allSessions.push(meta);
        }
      }
    }

    // Sort by startTime descending (newest first)
    allSessions.sort((a, b) => (a.startTime > b.startTime ? -1 : 1));

    return NextResponse.json(allSessions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

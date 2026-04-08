import { readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import { parseSession } from '@anytime-markdown/trail-viewer/parser';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');

async function findSessionFile(
  sessionId: string,
): Promise<{ filePath: string; projectName: string } | null> {
  let projectDirs: string[];
  try {
    const entries = await readdir(PROJECTS_DIR, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return null;
  }

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
      // JSONL files are named {sessionId}.jsonl
      if (file === `${sessionId}.jsonl`) {
        return { filePath: join(projPath, file), projectName: projDir };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Session ID is required' }, { status: 400 });
  }

  try {
    const found = await findSessionFile(id);
    if (!found) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const content = await readFile(found.filePath, 'utf-8');
    const { session, messages } = parseSession(content, found.projectName);

    return NextResponse.json({ session, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

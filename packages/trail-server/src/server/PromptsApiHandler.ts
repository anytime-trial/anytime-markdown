import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

import type { Logger } from '../runtime/Logger';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const PROMPTS_TTL_MS = 30_000;

export interface PromptEntry {
  id: string;
  name: string;
  content: string;
  version: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * `~/.claude/` 配下のプロンプトファイル (CLAUDE.md / rules / project CLAUDE.md /
 * memory / SKILL.md / scripts / settings.json) を走査して PromptEntry の配列を返す。
 *
 * 全件 fs.readdirSync / readFileSync の同期 I/O を使うため、HTTP ハンドラから直接呼ぶと
 * イベントループをブロックする。`PromptsApiHandler` は 30 秒 TTL でキャッシュする。
 */
export function scanPromptFiles(): PromptEntry[] {
  const claudeDir = path.join(os.homedir(), '.claude');
  const prompts: PromptEntry[] = [];
  let version = 1;

  function addFile(filePath: string, tags: string[]): void {
    let fd: number | null = null;
    try {
      // TOCTOU 競合を避けるため、open 後の fstat で種別とサイズを参照する。
      fd = fs.openSync(filePath, 'r');
      const stat = fs.fstatSync(fd);
      if (!stat.isFile()) return;
      const buffer = Buffer.alloc(stat.size);
      fs.readSync(fd, buffer, 0, stat.size, 0);
      const content = buffer.toString('utf-8');
      const name = path.basename(filePath, '.md');
      const relPath = path.relative(claudeDir, filePath);
      const id = relPath.replaceAll(/[/\\. ]+/g, '-').toLowerCase();
      prompts.push({
        id,
        name,
        content,
        version: version++,
        tags,
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    } catch {
      // skip unreadable file
    } finally {
      if (fd !== null) {
        try { fs.closeSync(fd); } catch { /* fd may be invalid */ }
      }
    }
  }

  // 1. Global CLAUDE.md
  addFile(path.join(claudeDir, 'CLAUDE.md'), ['main']);

  // 2. Rules
  const rulesDir = path.join(claudeDir, 'rules');
  try {
    for (const f of fs.readdirSync(rulesDir)) {
      if (f.endsWith('.md')) {
        addFile(path.join(rulesDir, f), ['rule']);
      }
    }
  } catch {
    // rules dir may not exist
  }

  // 3. Project CLAUDE.md files
  const projectsDir = path.join(claudeDir, 'projects');
  try {
    for (const proj of fs.readdirSync(projectsDir)) {
      const projClaudeMd = path.join(projectsDir, proj, 'CLAUDE.md');
      if (fs.existsSync(projClaudeMd)) {
        addFile(projClaudeMd, ['project', proj]);
      }
    }
  } catch {
    // projects dir may not exist
  }

  // 4. Memory
  const memoryDir = path.join(claudeDir, 'projects');
  try {
    for (const proj of fs.readdirSync(memoryDir)) {
      const memDir = path.join(memoryDir, proj, 'memory');
      if (fs.existsSync(memDir) && fs.statSync(memDir).isDirectory()) {
        for (const f of fs.readdirSync(memDir)) {
          if (f.endsWith('.md')) {
            addFile(path.join(memDir, f), ['memory', proj]);
          }
        }
      }
    }
  } catch {
    // skip
  }

  // 5. Skills (SKILL.md in each skill directory)
  const skillsDir = path.join(claudeDir, 'skills');
  try {
    for (const skillName of fs.readdirSync(skillsDir)) {
      const skillFile = path.join(skillsDir, skillName, 'SKILL.md');
      if (fs.existsSync(skillFile)) {
        addFile(skillFile, ['skill', skillName]);
      }
    }
  } catch {
    // skills dir may not exist
  }

  // 6. Scripts
  const scriptsDir = path.join(claudeDir, 'scripts');
  try {
    for (const f of fs.readdirSync(scriptsDir)) {
      const scriptFile = path.join(scriptsDir, f);
      if (!fs.existsSync(scriptFile) || !fs.statSync(scriptFile).isFile()) continue;
      addFile(scriptFile, ['script']);
    }
  } catch {
    // scripts dir may not exist
  }

  // 7. settings.json
  const settingsFile = path.join(claudeDir, 'settings.json');
  let settingsFd: number | null = null;
  try {
    // TOCTOU 競合を避けるため、open 後の fstat で種別とサイズを参照する。
    settingsFd = fs.openSync(settingsFile, 'r');
    const stat = fs.fstatSync(settingsFd);
    if (stat.isFile()) {
      const buffer = Buffer.alloc(stat.size);
      fs.readSync(settingsFd, buffer, 0, stat.size, 0);
      prompts.push({
        id: 'settings-json',
        name: 'settings.json',
        content: buffer.toString('utf-8'),
        version: version++,
        tags: ['config'],
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
      });
    }
  } catch {
    // skip
  } finally {
    if (settingsFd !== null) {
      try { fs.closeSync(settingsFd); } catch { /* fd may be invalid */ }
    }
  }

  return prompts;
}

/**
 * `GET /api/trail/prompts` のハンドラ。
 * 30 秒 TTL でキャッシュし、`scanPromptFiles` の同期 I/O によるブロッキングを抑える。
 */
export class PromptsApiHandler {
  private cache: { value: PromptEntry[]; expiresAt: number } | null = null;

  constructor(private readonly logger: Logger) {}

  handleGet(res: http.ServerResponse): void {
    try {
      const now = Date.now();
      let prompts: PromptEntry[];
      if (this.cache && now < this.cache.expiresAt) {
        prompts = this.cache.value;
      } else {
        prompts = scanPromptFiles();
        this.cache = { value: prompts, expiresAt: now + PROMPTS_TTL_MS };
      }
      res.writeHead(200, JSON_HEADERS);
      res.end(JSON.stringify({ prompts }));
    } catch (err) {
      this.logger.error('[/api/trail/prompts] failed', err);
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: 'Failed to read prompts' }));
    }
  }
}

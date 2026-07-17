import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  parseTicketMarkdown,
  validateTicketFrontmatter,
} from '@anytime-markdown/tickets-core/ticketModel';

/** `.tickets/` フロントマターから TCR 計測に使う最小フィールド。 */
export interface WorkspaceTicket {
  assignee?: string;
  status: string;
  updated_at: string;
}

/**
 * ワークスペースの `.tickets/`（+ `archive/`）を読み取り専用でパースする。
 * ディレクトリ不在・解析不能ファイルは skip し、`log` があれば理由を通知する
 * （要件 FR-2: エラーにせず縮退。正本は Git のため書き込みは一切行わない）。
 */
export function readWorkspaceTickets(
  workspaceRoot: string,
  log?: (message: string) => void,
): WorkspaceTicket[] {
  const dirs = [
    path.join(workspaceRoot, '.tickets'),
    path.join(workspaceRoot, '.tickets', 'archive'),
  ];
  const tickets: WorkspaceTicket[] = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      log?.(`readWorkspaceTickets: skip missing dir ${dir}`);
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.md')) continue;
      const filePath = path.join(dir, name);
      try {
        const parsed = parseTicketMarkdown(fs.readFileSync(filePath, 'utf8'));
        if (parsed === null) {
          log?.(`readWorkspaceTickets: no frontmatter ${filePath}`);
          continue;
        }
        const result = validateTicketFrontmatter(parsed.frontmatter);
        if (!result.ok) {
          log?.(`readWorkspaceTickets: invalid ticket ${filePath}: ${result.errors.join(', ')}`);
          continue;
        }
        const ticket: WorkspaceTicket = {
          status: result.value.status,
          updated_at: result.value.updated_at,
        };
        if (result.value.assignee !== undefined) ticket.assignee = result.value.assignee;
        tickets.push(ticket);
      } catch (e) {
        log?.(`readWorkspaceTickets: parse failed ${filePath}: ${String(e)}`);
      }
    }
  }
  return tickets;
}

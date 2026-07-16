import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readWorkspaceTickets } from '../workspaceTickets';

function writeTicket(dir: string, name: string, frontmatter: string): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), `---\n${frontmatter}\n---\n\n## Description\n\nbody\n`, 'utf8');
}

const VALID_BASE = [
  'id: "T-1"',
  'title: "sample"',
  'priority: "medium"',
  'creator: "user"',
  'created_at: "2026-04-20T00:00:00.000Z"',
].join('\n');

describe('readWorkspaceTickets', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-tickets-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('returns empty array when .tickets does not exist', () => {
    expect(readWorkspaceTickets(root)).toEqual([]);
  });

  it('reads tickets from .tickets and .tickets/archive', () => {
    writeTicket(
      path.join(root, '.tickets'),
      't-1.md',
      `${VALID_BASE}\nstatus: "in_progress"\nassignee: "agent"\nupdated_at: "2026-04-21T00:00:00.000Z"`,
    );
    writeTicket(
      path.join(root, '.tickets', 'archive'),
      't-2.md',
      `${VALID_BASE.replace('T-1', 'T-2')}\nstatus: "completed"\nassignee: "agent"\nupdated_at: "2026-04-22T00:00:00.000Z"`,
    );

    const tickets = readWorkspaceTickets(root);
    expect(tickets).toHaveLength(2);
    expect(tickets).toContainEqual({
      assignee: 'agent',
      status: 'in_progress',
      updated_at: '2026-04-21T00:00:00.000Z',
    });
    expect(tickets).toContainEqual({
      assignee: 'agent',
      status: 'completed',
      updated_at: '2026-04-22T00:00:00.000Z',
    });
  });

  it('skips files with invalid frontmatter and logs them', () => {
    writeTicket(
      path.join(root, '.tickets'),
      'valid.md',
      `${VALID_BASE}\nstatus: "completed"\nassignee: "agent"\nupdated_at: "2026-04-21T00:00:00.000Z"`,
    );
    writeTicket(path.join(root, '.tickets'), 'broken.md', 'status: "not-a-valid-status"');
    fs.writeFileSync(path.join(root, '.tickets', 'no-frontmatter.md'), 'just text\n', 'utf8');
    fs.writeFileSync(path.join(root, '.tickets', 'ignored.txt'), 'not markdown\n', 'utf8');

    const logs: string[] = [];
    const tickets = readWorkspaceTickets(root, (m) => logs.push(m));
    expect(tickets).toHaveLength(1);
    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('omits assignee when frontmatter has none', () => {
    writeTicket(
      path.join(root, '.tickets'),
      't-3.md',
      `${VALID_BASE}\nstatus: "completed"\nupdated_at: "2026-04-21T00:00:00.000Z"`,
    );
    const tickets = readWorkspaceTickets(root);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.assignee).toBeUndefined();
  });
});

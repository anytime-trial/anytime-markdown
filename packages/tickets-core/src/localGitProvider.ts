import {
  buildTicketBody,
  nextTicketId,
  parseTicketMarkdown,
  serializeTicket,
  ticketFileName,
  validateTicketFrontmatter,
  type TicketFrontmatter,
} from './ticketModel';
import type { CreateTicketInput } from './ticketRepository';
import type {
  ArchiveTicketRecordInput,
  DeleteTicketRecordInput,
  InvalidTicketRecord,
  TicketProvider,
  TicketProviderListResult,
  TicketRecord,
  UpdateTicketRecordInput,
} from './ticketProvider';

const TICKETS_DIR = '.tickets';
const ARCHIVE_DIR = '.tickets/archive';

/**
 * ローカルクローンのファイルシステムと git を扱うための最小の口。
 *
 * Why not: `node:fs` / `node:child_process` を直接呼ばない。tickets-core は
 * web-app（ブラウザ）からも読み込まれるパッケージであり、Node 専用 API を
 * 静的に import するとバンドルが壊れる。呼び出し側（VS Code 拡張）が実装を渡す。
 */
export interface LocalGitIo {
  /** ディレクトリ直下のファイル名一覧。ディレクトリが無ければ空配列 */
  listFiles(dir: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** 内容から不透明な版数トークンを作る（楽観ロック用） */
  hash(text: string): string;
  /** git をリポジトリルートで実行する。失敗時は例外を投げる */
  git(args: string[]): Promise<string>;
}

export interface LocalGitProviderConfig {
  provider: 'local-git';
  /** チケットリポジトリのローカルクローンのルート */
  repoRoot: string;
  io: LocalGitIo;
  /** commit の author 表示に使う。省略時は git の設定に従う */
  authorName?: string;
}

/**
 * 競合（他者が同じファイルを変更していた／push が拒否された）。
 *
 * `status` を 409 にすることで、RPC ハンドラの写像を通って webview 側の
 * `TicketsClientError.conflict` になり、既存の再読込導線がそのまま働く。
 */
export class LocalGitConflictError extends Error {
  readonly status = 409;

  constructor(message: string) {
    super(message);
    this.name = 'LocalGitConflictError';
  }
}

function joinPath(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

function isTicketFile(name: string): boolean {
  return name.endsWith('.md');
}

/**
 * ローカルクローンの `.tickets/` を正本とするプロバイダ。
 *
 * GitHub API とアクセストークンを使わず、既にクローンが持っている git の資格情報
 * （SSH 鍵等）で完結する。読み取りはファイルシステム、保存はファイル書き込み →
 * commit → push で行う。
 *
 * Why not: 読み取り時に自動 fetch / pull しない。ユーザーの作業ツリーを勝手に
 * 動かさないためで、古さの解消は手動 pull か既存のループ運用に委ねる。
 * その代わり push が非 fast-forward で拒否された場合は競合として返し、
 * UI の再読込導線に乗せる。
 */
export class LocalGitProvider implements TicketProvider {
  readonly kind = 'local-git' as const;

  private readonly io: LocalGitIo;
  private readonly root: string;

  constructor(config: LocalGitProviderConfig) {
    this.io = config.io;
    this.root = config.repoRoot;
  }

  private abs(relative: string): string {
    return joinPath(this.root, relative);
  }

  private async readRecord(relativePath: string, archived: boolean): Promise<TicketRecord | InvalidTicketRecord> {
    const text = await this.io.readFile(this.abs(relativePath));
    const version = this.io.hash(text);
    const parsed = parseTicketMarkdown(text);
    if (!parsed) {
      return { path: relativePath, version, reason: 'フロントマターを解析できません' };
    }
    const validated = validateTicketFrontmatter(parsed.frontmatter);
    if (!validated.ok) {
      return { path: relativePath, version, reason: validated.errors.join(' / ') };
    }
    return {
      path: relativePath,
      version,
      frontmatter: validated.value,
      extras: validated.extras,
      body: parsed.body,
      archived,
    };
  }

  private async listDir(dir: string, archived: boolean): Promise<(TicketRecord | InvalidTicketRecord)[]> {
    const names = await this.io.listFiles(this.abs(dir));
    const records: (TicketRecord | InvalidTicketRecord)[] = [];
    for (const name of names.filter(isTicketFile)) {
      records.push(await this.readRecord(joinPath(dir, name), archived));
    }
    return records;
  }

  async list(options?: { includeArchive?: boolean }): Promise<TicketProviderListResult> {
    const active = await this.listDir(TICKETS_DIR, false);
    const archived = options?.includeArchive === true ? await this.listDir(ARCHIVE_DIR, true) : [];
    const all = [...active, ...archived];
    return {
      tickets: all.filter((r): r is TicketRecord => 'frontmatter' in r),
      invalid: all.filter((r): r is InvalidTicketRecord => !('frontmatter' in r)),
    };
  }

  async get(path: string): Promise<TicketRecord | InvalidTicketRecord> {
    return this.readRecord(path, path.startsWith(`${ARCHIVE_DIR}/`));
  }

  /** 保存前に、読み込んだ時点から中身が変わっていないことを確かめる。 */
  private async assertUnchanged(relativePath: string, expectedVersion: string): Promise<void> {
    const current = this.io.hash(await this.io.readFile(this.abs(relativePath)));
    if (current !== expectedVersion) {
      throw new LocalGitConflictError(
        `${relativePath} は読み込み後に変更されています。再読込してからやり直してください。`,
      );
    }
  }

  /**
   * 変更を commit して push する。
   *
   * push が非 fast-forward で拒否された場合は競合として返す。自動で pull / rebase は
   * しない（ユーザーの作業ツリーを勝手に動かさない方針）。commit 済みの変更はローカルに
   * 残るため、ユーザーが pull してから再度 push すれば失われない。
   */
  private async commitAndPush(paths: string[], message: string): Promise<void> {
    for (const p of paths) {
      await this.io.git(['add', '--', p]);
    }
    await this.io.git(['commit', '-m', message]);
    try {
      await this.io.git(['push']);
    } catch (error) {
      throw new LocalGitConflictError(
        'push が拒否されました。リモートが進んでいる可能性があります。' +
          `pull してから再度保存してください（コミットはローカルに残っています）。: ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    const [active, archived] = await Promise.all([
      this.io.listFiles(this.abs(TICKETS_DIR)),
      this.io.listFiles(this.abs(ARCHIVE_DIR)),
    ]);
    const existingIds = [...active, ...archived]
      .map((name) => /^(T-\d+)-/.exec(name)?.[1])
      .filter((id): id is string => id !== undefined);
    const id = nextTicketId(existingIds);

    const frontmatter: TicketFrontmatter = {
      id,
      title: input.title,
      status: input.status,
      priority: input.priority,
      created_at: input.now,
      updated_at: input.now,
    };
    if (input.assignee !== undefined) frontmatter.assignee = input.assignee;
    if (input.creator !== undefined) frontmatter.creator = input.creator;
    if (input.workspace !== undefined) frontmatter.workspace = input.workspace;
    if (input.dependencies !== undefined) frontmatter.dependencies = input.dependencies;
    if (input.estimate !== undefined) frontmatter.estimate = input.estimate;

    const validated = validateTicketFrontmatter({ ...frontmatter });
    if (!validated.ok) {
      throw new Error(`入力が不正です: ${validated.errors.join(' / ')}`);
    }

    const body = buildTicketBody(input.description ?? '');
    const relativePath = joinPath(TICKETS_DIR, ticketFileName(id, input.title));
    const text = serializeTicket(frontmatter, body);
    await this.io.writeFile(this.abs(relativePath), text);
    await this.commitAndPush([relativePath], input.message ?? `ticket: create ${id} ${input.title}`);

    return { path: relativePath, version: this.io.hash(text), frontmatter, extras: {}, body, archived: false };
  }

  async update(input: UpdateTicketRecordInput): Promise<{ path: string; version: string }> {
    await this.assertUnchanged(input.path, input.version);
    await this.io.writeFile(this.abs(input.path), input.content);
    await this.commitAndPush([input.path], input.message);
    return { path: input.path, version: this.io.hash(input.content) };
  }

  async remove(input: DeleteTicketRecordInput): Promise<void> {
    await this.assertUnchanged(input.path, input.version);
    await this.io.deleteFile(this.abs(input.path));
    await this.commitAndPush([input.path], input.message ?? `ticket: delete ${input.path}`);
  }

  async archive(input: ArchiveTicketRecordInput): Promise<{ newPath: string }> {
    await this.assertUnchanged(input.path, input.version);
    const name = input.path.slice(input.path.lastIndexOf('/') + 1);
    const newPath = joinPath(ARCHIVE_DIR, name);
    await this.io.rename(this.abs(input.path), this.abs(newPath));
    await this.commitAndPush(
      [input.path, newPath],
      input.message ?? `ticket: archive ${name}`,
    );
    return { newPath };
  }
}

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
 * 受け入れるチケットのパス形。`.tickets/` 直下か `.tickets/archive/` 直下の `.md` のみ。
 * セグメントに `/` を許さないため、階層を掘る形も弾く。
 */
const TICKET_PATH = /^\.tickets\/(?:archive\/)?[^/]+\.md$/;

/** push が非 fast-forward で拒否されたことを示す git の出力。 */
const NON_FAST_FORWARD = /\[rejected\]|non-fast-forward|fetch first|Updates were rejected/i;

/** push 先そのものが存在しないことを示す git の出力（競合ではない）。 */
const NO_PUSH_TARGET =
  /No configured push destination|has no upstream branch|does not appear to be a git repository/i;

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
  /** ファイルが存在するか。「他者に削除された」を読み取り失敗と区別するために使う */
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, text: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  /** 内容から不透明な版数トークンを作る（楽観ロック用） */
  hash(text: string): string;
  /** git をリポジトリルートで実行する。失敗時は stderr を含む例外を投げる */
  git(args: string[]): Promise<string>;
}

export interface LocalGitProviderConfig {
  provider: 'local-git';
  /** チケットリポジトリのローカルクローンのルート */
  repoRoot: string;
  io: LocalGitIo;
  /**
   * 保存自体は成立したが利用者に伝えるべき事象（push 先が無い等）の通知先。
   * 例外にすると保存が失敗したように見えるが、黙って捨てると push されていないことに気づけない。
   */
  onWarn?: (message: string) => void;
}

/**
 * 競合（他者が同じファイルを変更・削除していた／push が非 fast-forward で拒否された）。
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

/**
 * チケットとして扱えないパスを指定された（呼び出し側の不正な入力）。
 *
 * `status` 400 は RPC ハンドラを通って「入力が不正」として返る。500 にしないのは、
 * サーバー側の障害ではなく要求そのものが受理できないことを区別するため。
 */
export class LocalGitPathError extends Error {
  readonly status = 400;

  constructor(path: string) {
    super(`チケットのパスとして不正です: ${path}`);
    this.name = 'LocalGitPathError';
  }
}

/**
 * 与えられた相対パスがチケット置き場の中に収まることを保証する。
 *
 * Why not: `abs()` の文字列連結だけで済ませない。連結だけでは `.tickets/../../x` の
 * ような入力がリポジトリ外の実ファイルへ解決し、書き込み・削除が成立してしまう
 * （その後の `git add` が失敗して UI には「保存に失敗」と出るため、破壊に気づけない）。
 * webview は拡張が配信する信頼できる出所だが、RPC 層は他の項目を検証しており、
 * パスだけ素通しにするのは一貫しない。
 */
function assertTicketPath(relativePath: string): void {
  if (relativePath.split('/').includes('..') || !TICKET_PATH.test(relativePath)) {
    throw new LocalGitPathError(relativePath);
  }
}

function joinPath(...parts: string[]): string {
  return parts.filter((p) => p !== '').join('/');
}

function isTicketFile(name: string): boolean {
  return name.endsWith('.md');
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  private readonly onWarn?: (message: string) => void;

  constructor(config: LocalGitProviderConfig) {
    this.io = config.io;
    this.root = config.repoRoot;
    this.onWarn = config.onWarn;
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
    assertTicketPath(path);
    return this.readRecord(path, path.startsWith(`${ARCHIVE_DIR}/`));
  }

  /**
   * 保存前に、読み込んだ時点から中身が変わっていないことを確かめる。
   * 削除されていた場合も競合として扱う（読み込み後に他者が変えた点は同じで、
   * 生の ENOENT を返すと UI の再読込導線に乗らない）。
   */
  private async assertUnchanged(relativePath: string, expectedVersion: string): Promise<void> {
    assertTicketPath(relativePath);
    if (!(await this.io.exists(this.abs(relativePath)))) {
      throw new LocalGitConflictError(
        `${relativePath} は読み込み後に削除されています。再読込してからやり直してください。`,
      );
    }
    const current = this.io.hash(await this.io.readFile(this.abs(relativePath)));
    if (current !== expectedVersion) {
      throw new LocalGitConflictError(
        `${relativePath} は読み込み後に変更されています。再読込してからやり直してください。`,
      );
    }
  }

  /**
   * 対象パスだけを commit する。
   *
   * Why not: `git commit -m <msg>` をパススペック無しで実行しない。それだとインデックス
   * 全体がコミットされ、利用者がチケットリポジトリで別途 stage していた無関係な変更まで
   * チケット保存の commit に同梱されて push される（実測で再現）。
   */
  private async commitOnly(paths: string[], message: string): Promise<void> {
    try {
      for (const p of paths) {
        await this.io.git(['add', '--', p]);
      }
      await this.io.git(['commit', '-m', message, '--', ...paths]);
    } catch (error) {
      // ファイルは既に書き換わっている。「保存できなかった」ではなく実態を伝える。
      throw new Error(
        `ファイルは更新しましたが commit できませんでした。git の状態を確認してください: ${describeError(error)}`,
      );
    }
  }

  /**
   * commit 済みの変更を push する。
   *
   * push の失敗を一律で競合にしない。非 fast-forward だけが「他者が先に進めた」＝競合であり、
   * push 先が無い構成（remote 未設定のクローンも設計上サポートする）で毎回競合を出すと、
   * 保存 → 競合表示 → 再読込 → 再保存が延々と続いて前に進めなくなる。
   */
  private async push(): Promise<void> {
    try {
      await this.io.git(['push']);
    } catch (error) {
      const detail = describeError(error);
      if (NON_FAST_FORWARD.test(detail)) {
        throw new LocalGitConflictError(
          'push が拒否されました。リモートが進んでいます。pull してから再度保存してください' +
            '（コミットはローカルに残っています）。',
        );
      }
      if (NO_PUSH_TARGET.test(detail)) {
        this.onWarn?.(`push 先が設定されていないため、ローカルの commit のみ行いました: ${detail}`);
        return;
      }
      throw new Error(
        `commit は完了しましたが push できませんでした（変更はローカルに残っています）: ${detail}`,
      );
    }
  }

  private async commitAndPush(paths: string[], message: string): Promise<void> {
    await this.commitOnly(paths, message);
    await this.push();
  }

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    const [active, archived] = await Promise.all([
      this.io.listFiles(this.abs(TICKETS_DIR)),
      this.io.listFiles(this.abs(ARCHIVE_DIR)),
    ]);
    // SHORTCUT: ID はローカルクローンのファイル名走査だけで採番している.
    // ceiling: 読み取り時に fetch しない方針の帰結として、remote に既にある同番号を知らずに
    // 採番しうる（衝突は push 拒否＝競合として顕在化し、データは失われない）。単一クローン運用が前提.
    // upgrade: 複数人が同時に create する運用が始まったら、create 前に git fetch して
    // remote 側の .tickets を突き合わせてから採番する.
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
    assertTicketPath(relativePath);
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
    assertTicketPath(newPath);
    await this.io.rename(this.abs(input.path), this.abs(newPath));
    await this.commitAndPush([input.path, newPath], input.message ?? `ticket: archive ${name}`);
    return { newPath };
  }
}

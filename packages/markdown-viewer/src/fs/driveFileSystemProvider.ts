import type { FileHandle, FileOpenResult, FileSystemProvider } from "../types/fileSystem";
import {
  buildDriveMediaRequest,
  buildDriveMetaRequest,
  buildDriveUpdateRequest,
  type DriveFileMeta,
} from "./driveClient";

/**
 * Drive ファイルの native ハンドル。{@link FileHandle.nativeHandle} にこの形で保持する。
 * `headRevisionId` は save() 時の楽観的並行制御に使う（Drive 上の最新 revision と不一致なら競合）。
 */
export interface DriveNativeHandle {
  fileId: string;
  headRevisionId: string;
}

/** `unknown` の nativeHandle を {@link DriveNativeHandle} として安全に絞り込む型ガード。 */
function isDriveNativeHandle(value: unknown): value is DriveNativeHandle {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.fileId === "string" && typeof v.headRevisionId === "string";
}

/**
 * Drive 上の headRevisionId が save() 時点の想定と異なる（他所で更新済み）場合に投げる。
 * `instanceof` は bundling/別 realm を跨ぐと壊れうるため、判別は `name` プロパティで行う
 * （呼び出し側は `error.name === "DriveConflictError"` で判定する）。
 */
export class DriveConflictError extends Error {
  readonly latestHeadRevisionId: string;

  constructor(latestHeadRevisionId: string) {
    super(`Drive file has been modified since last read (headRevisionId: ${latestHeadRevisionId})`);
    this.name = "DriveConflictError";
    this.latestHeadRevisionId = latestHeadRevisionId;
    // Error のプロトタイプチェーンは transpile 先（ES5 相当ターゲット）によっては
    // 継承先が壊れることがあるため明示的に復元する。
    Object.setPrototypeOf(this, DriveConflictError.prototype);
  }
}

export interface DriveFileSystemProviderOptions {
  /** Drive API へ渡す OAuth アクセストークンを取得する。呼び出しごとに最新値を取得する想定。 */
  getToken: () => Promise<string>;
  /**
   * fetch 実装。省略時は `globalThis.fetch` を束縛して使う（テスト注入用。
   * 本番パスへの暗黙フォールバックは行わない——省略時も明示的に globalThis.fetch を使うのみで、
   * 他のエンドポイントへのすり替えは発生しない）。
   */
  fetchFn?: typeof fetch;
  /**
   * save() で headRevisionId の競合を検出した際に呼ばれる。true を返せば最新 revision で上書きし
   * 再試行、false/undefined（または未指定）なら {@link DriveConflictError} を呼び出し元へ投げる。
   *
   * `FileSystemProvider.save()` は `Promise<void>` のみで conflict 情報を呼び出し元へ返す経路が
   * ないため（fileOpsController.ts は try/catch 無しで呼ぶ既存実装。変更不可）、confirm 判断は
   * provider 自身で完結させる。拡張側は `globalThis.confirm` を注入する想定。
   */
  confirmOverwrite?: (latestHeadRevisionId: string) => boolean | Promise<boolean>;
}

/**
 * Google Drive API v3 ベースの {@link FileSystemProvider}。
 *
 * `open()` は Picker 前提の UI がない文脈のため常に `null` を返す。ファイルを開く場合は
 * {@link DriveFileSystemProvider.openById} を使う（拡張のコンテキストメニュー経由等）。
 * `saveAs()` も初期リリースでは新規ファイル作成をサポートせず `null` を返す。
 */
export class DriveFileSystemProvider implements FileSystemProvider {
  readonly supportsDirectAccess = true;

  private readonly getToken: () => Promise<string>;
  private readonly fetchFn: typeof fetch;
  private readonly confirmOverwrite?: (
    latestHeadRevisionId: string,
  ) => boolean | Promise<boolean>;

  constructor(options: DriveFileSystemProviderOptions) {
    this.getToken = options.getToken;
    // globalThis.fetch を束縛せずクロージャで包む。jsdom 等 fetch 未定義環境でも
    // コンストラクタ自体は落ちず、実際に呼ばれた時点で初めて未定義エラーになる
    // （service worker / ブラウザ実行時は globalThis.fetch が常に存在する）。
    this.fetchFn = options.fetchFn ?? ((input, init) => globalThis.fetch(input, init));
    this.confirmOverwrite = options.confirmOverwrite;
  }

  async open(): Promise<FileOpenResult | null> {
    return null;
  }

  /** fileId 指定でメタ＋本文を取得する（Picker 選択後・拡張の右クリックメニュー等から呼ぶ）。 */
  async openById(fileId: string): Promise<FileOpenResult> {
    const token = await this.getToken();
    const meta = await this.fetchMeta(token, fileId);
    const content = await this.fetchContent(token, fileId);
    return {
      handle: {
        name: meta.name,
        nativeHandle: { fileId, headRevisionId: meta.headRevisionId } satisfies DriveNativeHandle,
      },
      content,
    };
  }

  async save(handle: FileHandle, content: string): Promise<void> {
    if (!isDriveNativeHandle(handle.nativeHandle)) {
      console.error(
        `[${new Date().toISOString()}] [ERROR] DriveFileSystemProvider.save: invalid nativeHandle for "${handle.name}"`,
      );
      return;
    }
    const native = handle.nativeHandle;
    const token = await this.getToken();
    const latestMeta = await this.fetchMeta(token, native.fileId);

    if (latestMeta.headRevisionId !== native.headRevisionId) {
      const shouldOverwrite = this.confirmOverwrite
        ? await this.confirmOverwrite(latestMeta.headRevisionId)
        : false;
      if (!shouldOverwrite) {
        throw new DriveConflictError(latestMeta.headRevisionId);
      }
      native.headRevisionId = latestMeta.headRevisionId;
    }

    await this.updateContent(token, native, content);
  }

  async saveAs(_content: string): Promise<FileHandle | null> {
    return null;
  }

  private async updateContent(
    token: string,
    native: DriveNativeHandle,
    content: string,
  ): Promise<void> {
    const req = buildDriveUpdateRequest(native.fileId, content);
    const res = await this.fetchFn(req.url, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(req.contentType ? { "Content-Type": req.contentType } : {}),
      },
      body: req.body,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[${new Date().toISOString()}] [ERROR] Drive update failed for fileId=${native.fileId}: ${res.status} ${text}`,
      );
    }
    const refreshed = await this.fetchMeta(token, native.fileId);
    native.headRevisionId = refreshed.headRevisionId;
  }

  private async fetchMeta(token: string, fileId: string): Promise<DriveFileMeta> {
    const req = buildDriveMetaRequest(fileId);
    const res = await this.fetchFn(req.url, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[${new Date().toISOString()}] [ERROR] Drive meta fetch failed for fileId=${fileId}: ${res.status} ${text}`,
      );
    }
    return (await res.json()) as DriveFileMeta;
  }

  private async fetchContent(token: string, fileId: string): Promise<string> {
    const req = buildDriveMediaRequest(fileId);
    const res = await this.fetchFn(req.url, {
      method: req.method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `[${new Date().toISOString()}] [ERROR] Drive content fetch failed for fileId=${fileId}: ${res.status} ${text}`,
      );
    }
    return res.text();
  }
}

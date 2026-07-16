// Phase 5 S5 (EmergencyPanel UI): Kill Switch / セーフポイント復旧を HTTP へ露出する。
//
// 設計の要点（要件書 §17.3 / §19）:
//   - trail-viewer は webview ではなくブラウザアプリなので、UI から緊急停止を操作するには
//     サーバー側に経路が要る。VS Code コマンドへ WS で委譲する案は、暴走時に最も止まりやすい
//     拡張ホストへ依存するため却下した（要件書 §17.3）。
//   - localhost バインドはクロスオリジン送信を防げない。変更系 POST は Origin allowlist +
//     カスタムヘッダ必須で、悪意ある Web ページからの CSRF 型送信を拒否する。
//   - git は非破壊 2 種（cat-file -e / switch -c）だけを許可リストで実行する。commitHash は
//     16 進検証を通してから使い、ブランチ名はサーバーが組み立てる（クライアント文字列を渡さない）。
import { execFile } from 'node:child_process';
import type * as http from 'node:http';
import { promisify } from 'node:util';

import {
  clearEmergencyState,
  readEmergencyState,
  resolveAirspaceDir,
  writeEmergencyState,
} from '@anytime-markdown/agent-core';
import type { TrailDatabase } from '@anytime-markdown/trail-db';

import type { Logger } from '../runtime/Logger';
import { sendServerError } from './errorResponse';

const execFileAsync = promisify(execFile);

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

/** 変更系 POST に必須のカスタムヘッダ。単純リクエストでは付けられない = CSRF 遮断。 */
const EMERGENCY_HEADER = 'x-anytime-emergency';

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/** git の commit hash（短縮 7 桁〜完全 40 桁）。これ以外は git へ渡さない。 */
const COMMIT_HASH = /^[0-9a-f]{7,40}$/i;

/** viewer 経由であることを emergency_log の detail に残す（VS Code 経由と区別する）。 */
const VIA = 'trail-viewer';

/**
 * 変更系 body の上限。この API の body は理由文字列か commit hash だけで、
 * 数百バイトを超える正当な用途がない。グローバル rate limit は 1 リクエスト内の
 * 巨大 body を抑止できないため、パース前にストリームを打ち切る（cross-review 合意指摘）。
 */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * セーフポイント照合時の取得件数。`safe_points` の保持上限（500）を上回る値にして、
 * 「一覧の後ろにある古いセーフポイントだけ復旧できない」取りこぼしを防ぐ。
 * UI 表示の 50 件とは別（UI は新しい順の表示都合、こちらは境界検査）。
 */
const SAFE_POINT_LOOKUP_LIMIT = 1000;

function sendJson(res: http.ServerResponse, payload: unknown): void {
  res.writeHead(200, JSON_HEADERS);
  res.end(JSON.stringify(payload));
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify({ error: message }));
}

/**
 * 実行を許可する git 引数だけを通す。**非破壊 2 種のみ**。
 *
 * ハンドラ自身は許可外の引数を組み立てないが、将来の改修で破壊的サブコマンドが
 * 混入しても実行させないための防波堤として独立して検査する（要件書 §19）。
 */
export function assertGitAllowlist(args: readonly string[]): void {
  const denied = (): never => {
    throw new Error(`git command not allowed: ${args.join(' ')}`);
  };
  if (args[0] === 'cat-file') {
    if (args.length !== 3 || args[1] !== '-e') denied();
    return;
  }
  if (args[0] === 'switch') {
    // 既存ブランチへの切替（switch <branch>）も許可しない。作るのは recover ブランチだけ。
    if (args.length !== 4 || args[1] !== '-c') denied();
    return;
  }
  denied();
}

export interface EmergencyApiOptions {
  /** コードリポジトリルート。server 起動時に固定される値（`TrailDataServer` の `gitRoot`） */
  readonly gitRepoRoot?: string;
  /** git 実行の seam（テスト用）。許可リスト検査は seam の外側で先に行う */
  readonly runGit?: (args: readonly string[], cwd: string) => Promise<string>;
  /** 現在時刻の seam（テスト用）。UTC ISO 8601 */
  readonly now?: () => string;
}

type EmergencyEventName = 'kill_switch_on' | 'kill_switch_off' | 'rollback_executed';

export class EmergencyApiHandler {
  constructor(
    private readonly trailDb: TrailDatabase,
    private readonly logger: Logger,
    private readonly options: EmergencyApiOptions = {},
  ) {}

  /**
   * Kill Switch の現在状態を返す。
   *
   * 台帳不在は `{ active: false }`（= 通常運転）。一方 gitRepoRoot 未設定・非 git は 409 を返し、
   * **「平常」と偽らない**。viewer 側は非 200 を「状態不明」として表示する（要件書 §17.1 の 3 状態）。
   */
  handleGetState(_req: http.IncomingMessage, res: http.ServerResponse): void {
    const dir = this.airspaceDir();
    if (dir === null) {
      sendError(res, 409, 'gitRoot is not configured on this server, or it is not a git repository');
      return;
    }
    try {
      const state = readEmergencyState(dir);
      if (state === null || !state.active) {
        sendJson(res, { active: false });
        return;
      }
      sendJson(res, {
        active: true,
        reason: state.reason,
        triggeredBy: state.triggeredBy,
        triggeredAt: state.triggeredAt,
      });
    } catch (err) {
      this.logError('/api/trail/emergency-state failed', err);
      sendServerError(res);
    }
  }

  async handleKillSwitch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readMutationBody(req, res);
    if (body === null) return;

    const dir = this.airspaceDir();
    if (dir === null) {
      sendError(res, 409, 'gitRoot is not configured on this server, or it is not a git repository');
      return;
    }

    const reason = typeof body['reason'] === 'string' ? body['reason'].trim() : '';
    if (reason === '') {
      sendError(res, 400, 'reason is required');
      return;
    }

    const state = {
      active: true,
      reason,
      triggeredBy: 'human',
      triggeredAt: this.now(),
    };
    try {
      writeEmergencyState(dir, state);
    } catch (err) {
      this.logError('killSwitch: failed to write ledger', err);
      sendServerError(res, 'Failed to activate Kill Switch');
      return;
    }
    this.logger.info(`[emergency] kill switch ON via ${VIA}: ${reason}`);
    this.record('kill_switch_on', reason, {});
    sendJson(res, { ok: true, state });
  }

  async handleRelease(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readMutationBody(req, res);
    if (body === null) return;

    const dir = this.airspaceDir();
    if (dir === null) {
      sendError(res, 409, 'gitRoot is not configured on this server, or it is not a git repository');
      return;
    }

    const current = readEmergencyState(dir);
    if (current === null || !current.active) {
      sendError(res, 409, 'Kill Switch is not active');
      return;
    }

    // 解除理由は任意。空なら発動時の理由を引き継いで記録する（VS Code コマンドと同じ挙動）。
    const reason = typeof body['reason'] === 'string' && body['reason'].trim() !== ''
      ? body['reason'].trim()
      : current.reason;

    try {
      clearEmergencyState(dir);
    } catch (err) {
      this.logError('release: failed to clear ledger', err);
      sendServerError(res, 'Failed to release Kill Switch');
      return;
    }
    this.logger.info(`[emergency] kill switch OFF via ${VIA}: ${reason}`);
    this.record('kill_switch_off', reason, { triggeredBy: current.triggeredBy });
    sendJson(res, { ok: true });
  }

  /**
   * 非破壊ロールバック。選択されたセーフポイントから recover ブランチを切るだけで、
   * 現在の作業ツリー・履歴は変更しない（S1 §3.3 の採用案と同一方式）。
   */
  async handleRollback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readMutationBody(req, res);
    if (body === null) return;

    const gitRepoRoot = this.options.gitRepoRoot ?? '';
    if (!gitRepoRoot) {
      sendError(res, 409, 'gitRoot is not configured on this server');
      return;
    }

    const commitHash = typeof body['commitHash'] === 'string' ? body['commitHash'].trim() : '';
    if (!COMMIT_HASH.test(commitHash)) {
      // git へ渡す前に弾く（クライアント文字列をそのまま引数にしない）
      sendError(res, 400, 'commitHash must be a hexadecimal git commit hash');
      return;
    }

    // 「セーフポイント復旧」という操作境界はサーバー側で強制する。UI が一覧から選ばせていても、
    // HTTP API として任意の既存コミットへ switch できてはこの endpoint の意味が崩れる
    // （cross-review 合意指摘）。
    const recordedCheck = this.isRecordedSafePoint(commitHash);
    if (recordedCheck === 'unavailable') {
      sendError(res, 409, 'trail.db is not open; safe points cannot be verified');
      return;
    }
    if (recordedCheck === 'no') {
      sendError(res, 403, 'commitHash is not a recorded safe point');
      return;
    }

    // GC 済み・DB にだけ残った sha を切り出そうとして失敗する前に実在検証する（何も変更しない）
    try {
      await this.git(['cat-file', '-e', `${commitHash}^{commit}`], gitRepoRoot);
    } catch {
      sendError(res, 404, `Commit ${commitHash.slice(0, 8)} no longer exists in this repository`);
      return;
    }

    const shortSha = commitHash.slice(0, 8);
    const recoverBranch = `recover-${shortSha}`;
    try {
      await this.git(['switch', '-c', recoverBranch, commitHash], gitRepoRoot);
    } catch (err) {
      this.logError('rollback: git switch failed', err);
      const message = err instanceof Error ? err.message : String(err);
      // ブランチ名衝突など運用上ありふれた失敗なので、原因が分かる粒度で返す（stack は載せない）
      sendError(res, 409, `Failed to create recovery branch ${recoverBranch}: ${message}`);
      return;
    }

    this.logger.info(`[emergency] rollback via ${VIA}: created ${recoverBranch} from ${commitHash}`);
    this.record('rollback_executed', typeof body['label'] === 'string' ? body['label'] : '', {
      commitHash,
      recoverBranch,
    });
    sendJson(res, { ok: true, recoverBranch });
  }

  /**
   * commitHash が記録済みセーフポイントか判定する。
   *
   * クライアントは短縮 hash を送り得るため前方一致で照合する（記録側は完全 hash）。
   * DB 未オープンは 'unavailable'。「照合できない」を「照合できた」に倒さない
   * （fail-open にすると境界チェックが素通りする）。
   */
  private isRecordedSafePoint(commitHash: string): 'yes' | 'no' | 'unavailable' {
    let points: readonly { commitHash: string }[];
    try {
      points = this.trailDb.listSafePoints(SAFE_POINT_LOOKUP_LIMIT);
    } catch (err) {
      this.logError('rollback: failed to list safe points', err);
      return 'unavailable';
    }
    const target = commitHash.toLowerCase();
    return points.some((p) => p.commitHash.toLowerCase().startsWith(target)) ? 'yes' : 'no';
  }

  private airspaceDir(): string | null {
    const gitRepoRoot = this.options.gitRepoRoot ?? '';
    if (!gitRepoRoot) return null;
    return resolveAirspaceDir(gitRepoRoot);
  }

  private now(): string {
    return this.options.now ? this.options.now() : new Date().toISOString();
  }

  private async git(args: readonly string[], cwd: string): Promise<string> {
    assertGitAllowlist(args);
    if (this.options.runGit) return this.options.runGit(args, cwd);
    const { stdout } = await execFileAsync('git', [...args], { cwd });
    return stdout.trim();
  }

  /**
   * 変更系 POST の共通前処理。送信元検証 → Content-Type → JSON パースまで通ったときだけ
   * body を返す。拒否時は応答済みで null を返す。
   */
  private async readMutationBody(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ): Promise<Record<string, unknown> | null> {
    const origin = req.headers.origin ?? '';
    if (origin !== '' && !LOCALHOST_ORIGIN.test(origin)) {
      // localhost バインドは他オリジンからの送信自体を防げないため、ここで拒否する
      this.logger.warn(`[emergency] rejected mutation from origin: ${origin}`);
      sendError(res, 403, 'Forbidden origin');
      return null;
    }
    if (req.headers[EMERGENCY_HEADER] !== '1') {
      sendError(res, 403, `${EMERGENCY_HEADER}: 1 header is required`);
      return null;
    }
    const mediaType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (mediaType !== 'application/json') {
      sendError(res, 415, 'Content-Type must be application/json');
      return null;
    }

    // content-length を申告しているなら読み始める前に弾く
    const declared = Number.parseInt(req.headers['content-length'] ?? '', 10);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      sendError(res, 413, 'Payload too large');
      return null;
    }

    const raw = await new Promise<string | null>((resolve) => {
      let acc = '';
      let size = 0;
      let aborted = false;
      req.on('data', (chunk: Buffer) => {
        if (aborted) return;
        size += chunk.length;
        // content-length は偽れるので累積も検査し、超えた時点で蓄積をやめる
        if (size > MAX_BODY_BYTES) {
          aborted = true;
          resolve(null);
          return;
        }
        acc += chunk.toString();
      });
      req.on('end', () => {
        if (!aborted) resolve(acc);
      });
    });
    if (raw === null) {
      sendError(res, 413, 'Payload too large');
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        sendError(res, 400, 'body must be a JSON object');
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      sendError(res, 400, 'invalid JSON body');
      return null;
    }
  }

  /**
   * emergency_log への記録は**副次効果**。主効果（台帳・ブランチ）は既に成立しているため、
   * 記録失敗で操作全体を失敗扱いにしない。ただし無言にはせず時刻付きで残す（silent catch 禁止）。
   */
  private record(event: EmergencyEventName, reason: string, detail: Record<string, unknown>): void {
    try {
      this.trailDb.recordEmergencyEvent({
        occurredAt: this.now(),
        event,
        reason,
        actor: 'human',
        sessionId: null,
        detailJson: JSON.stringify({ ...detail, via: VIA }),
      });
    } catch (err) {
      this.logError(`failed to record emergency event: ${event}`, err);
    }
  }

  private logError(message: string, err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.logger.error(`${message}: ${error.message}\n${error.stack ?? ''}`);
  }
}

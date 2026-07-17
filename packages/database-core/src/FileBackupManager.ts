import fs from 'node:fs';
import zlib from 'node:zlib';

/**
 * 世代管理バックアップの 1 エントリ。UI に表示する際の情報源。
 */
export interface BackupEntry {
  /** 世代番号（1 が最新、N が最古） */
  readonly generation: number;
  /** バックアップファイルの絶対パス（.bak.N.gz） */
  readonly path: string;
  /** バックアップ作成日時 */
  readonly mtime: Date;
  /** gzip 圧縮後のバイト数 */
  readonly compressedSize: number;
}

/**
 * FileBackupManager の追加オプション。
 */
export interface FileBackupManagerOptions {
  /**
   * バックアップファイルのサフィックス（既定 `.bak`）。
   * 用途別に独立した世代系列を持たせる（例: KB Pre-write Snapshot は `.kb`）。
   */
  readonly suffix?: string;
  /**
   * false にするとインスタンス内 1 回制限（ラッチ）を外し、呼び出しごとに
   * interval（最新世代の mtime）判定へ委ねる（既定 true = 従来挙動）。
   * 書込のたびに発火し得る Pre-write Snapshot 用途で使う。
   */
  readonly latchPerInstance?: boolean;
}

/**
 * SQLite DB ファイルの世代管理バックアップ。
 *
 * 任意の DB ファイルに対して `.bak.1.gz` → `.bak.N.gz` の gzip 圧縮ローテーション
 * を行う。SQLite ファイルは冗長性が高く、gzip level 1 でも 30〜50% 程度まで
 * 縮むためディスク使用量を大幅に抑えられる。
 *
 * 既定ではこのインスタンスの生存期間内で最初の `maybeRotate()` 呼び出し時にだけ
 * 既存 DB を圧縮ローテーションし、それ以降は no-op（1 セッション 1 回）。
 * `latchPerInstance: false` を指定すると呼び出しごとに interval 判定で
 * ローテーションする（デバウンスは `backupIntervalDays` の小数指定で分単位にできる）。
 */
export class FileBackupManager {
  /** デフォルトのバックアップ世代数。利用側で上書き可能。 */
  static readonly DEFAULT_BACKUP_GENERATIONS = 1;
  /** gzip 圧縮レベル。起動時のブロッキング時間を短縮するため level 1 を採用。 */
  private static readonly GZIP_LEVEL = 1;
  /**
   * gzip を試みる上限。Node の Buffer 上限（2 GiB）にマージンを引いた値。
   * これを超える DB は非圧縮コピーへフォールバックする（`compressTo` 参照）。
   */
  private static readonly DEFAULT_MAX_GZIP_BYTES = 1_500_000_000;
  /** gzip 上限（テストから差し替えられるようインスタンス値として持つ）。 */
  private maxGzipBytes: number = FileBackupManager.DEFAULT_MAX_GZIP_BYTES;
  private backupDone = false;
  private readonly suffix: string;
  private readonly latchPerInstance: boolean;

  /**
   * @param dbPath              対象 DB ファイルの絶対パス
   * @param backupGenerations   保持する世代数（0 以下はバックアップ無効）
   * @param backupIntervalDays  バックアップ間隔（日）。0 = 常に作成、正の値 = 最新世代が N 日以上古い場合のみ作成。小数可（例: 10 分 = 10 / (24 * 60)）
   * @param preWriteGuard       書き込み直前に呼ばれる任意のガード。テスト環境で保護領域への書き込みを止める用途。throw すれば操作は中断される。
   * @param options             サフィックス・ラッチ挙動の上書き（{@link FileBackupManagerOptions}）
   */
  constructor(
    private readonly dbPath: string,
    private readonly backupGenerations: number = FileBackupManager.DEFAULT_BACKUP_GENERATIONS,
    private readonly backupIntervalDays: number = 1,
    private readonly preWriteGuard?: (targetPath: string) => void,
    options?: FileBackupManagerOptions,
  ) {
    this.suffix = options?.suffix ?? '.bak';
    this.latchPerInstance = options?.latchPerInstance ?? true;
  }

  /**
   * 必要であればバックアップをローテートする。
   *
   * - ラッチ有効（既定）で既に実行済み (`backupDone=true`) なら no-op
   * - `shouldBackup()` が false なら no-op
   * - それ以外は `rotateBackups()` を実行
   *
   * @returns 実際にバックアップを作成した場合 true
   */
  maybeRotate(): boolean {
    if (this.latchPerInstance && this.backupDone) return false;
    if (!this.shouldBackup()) {
      this.backupDone = true;
      return false;
    }
    this.preWriteGuard?.(this.dbPath);
    const created = this.rotateBackups();
    this.backupDone = true;
    return created;
  }

  /**
   * バックアップを作成すべきか判定する。
   * - `backupGenerations <= 0`: 常に false
   * - `backupIntervalDays === 0`: 常に true
   * - `backupIntervalDays > 0`: 最新世代が存在しない、または mtime が N 日以上前の場合のみ true
   */
  private shouldBackup(): boolean {
    if (this.backupGenerations <= 0) return false;
    if (this.backupIntervalDays === 0) return true;
    const bak1 = this.backupPath(1);
    if (!fs.existsSync(bak1)) return true;
    const { mtime } = fs.statSync(bak1);
    const daysSince = (Date.now() - mtime.getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= this.backupIntervalDays;
  }

  /**
   * 既存 DB ファイルを `.bak.1.gz` へ、`.bak.1.gz` → `.bak.2.gz` → … と
   * シフトする。最古世代は上書きで破棄される。DB ファイルが存在しないケース
   * （新規作成中）は通常動作として無視し false を返す（「作成済み」の誤報防止）。
   *
   * @returns 実際に世代ファイルを作成した場合 true
   */
  private rotateBackups(): boolean {
    if (!fs.existsSync(this.dbPath)) return false;

    // 先に新世代を一時ファイルへ作り切る。旧世代の削除・シフトは成功後にだけ行う。
    // 旧実装は「最古世代を削除 → 圧縮」の順で、generations=1 では圧縮が失敗すると
    // 唯一のバックアップを失ったまま新規も作れなかった（2026-07-17 の事故で顕在化）。
    const tmp = `${this.backupPath(1)}.tmp-${process.pid}`;
    let produced: string;
    try {
      produced = this.compressTo(this.dbPath, tmp);
    } catch (err) {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      throw err;
    }

    const oldest = this.backupPath(this.backupGenerations);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }
    for (let gen = this.backupGenerations - 1; gen >= 1; gen -= 1) {
      const src = this.backupPath(gen);
      const dst = this.backupPath(gen + 1);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }
    // 非圧縮フォールバック時は .gz を名乗らせない（復元側が中身で判別できるように）
    const dest = produced === 'gzip' ? this.backupPath(1) : this.uncompressedBackupPath(1);
    fs.renameSync(tmp, dest);
    return true;
  }

  /**
   * DB ファイルを `dest` へ退避する。戻り値は採用した方式。
   *
   * `zlib.gzipSync` は入力を Buffer に載せるため、Node の Buffer 上限（2 GiB）を超える
   * DB では `fs.readFileSync` の時点で `RangeError` になる（2026-07-17 に trail.db 2.1GB で
   * 実際に発生し、拡張が起動不能になった）。サイズで崖を作らないため、上限に近い DB は
   * gzip を諦めて `copyFileSync`（Buffer を経由しない）で**バックアップ自体は必ず残す**。
   */
  private compressTo(src: string, dest: string): 'gzip' | 'copy' {
    if (fs.statSync(src).size > this.maxGzipBytes) {
      fs.copyFileSync(src, dest);
      return 'copy';
    }
    const gz = zlib.gzipSync(fs.readFileSync(src), { level: FileBackupManager.GZIP_LEVEL });
    fs.writeFileSync(dest, gz);
    return 'gzip';
  }

  /** 非圧縮フォールバック世代のパス（`.bak.N`。gzip 世代は `.bak.N.gz`）。 */
  private uncompressedBackupPath(generation: number): string {
    return `${this.dbPath}${this.suffix}.${generation}`;
  }

  /** 世代番号からバックアップファイルの絶対パスを導出。 */
  private backupPath(generation: number): string {
    return `${this.dbPath}${this.suffix}.${generation}.gz`;
  }

  /**
   * 現存する世代バックアップを世代番号昇順（1=最新）で返す。UI 表示向け。
   */
  listBackups(): readonly BackupEntry[] {
    const entries: BackupEntry[] = [];
    for (let gen = 1; gen <= this.backupGenerations; gen += 1) {
      // gzip 世代（.bak.N.gz）と、2 GiB 超で gzip を諦めた非圧縮世代（.bak.N）の両方を見る。
      // 片方しか見ないと、巨大 DB のバックアップが「存在しない」ことにされて復元できない。
      const bakPath = this.existingBackupPath(gen);
      if (bakPath === null) continue;
      const stat = fs.statSync(bakPath);
      entries.push({
        generation: gen,
        path: bakPath,
        mtime: stat.mtime,
        compressedSize: stat.size,
      });
    }
    return entries;
  }

  /**
   * 指定世代のバックアップを展開して DB ファイルへ復元する。
   * 復元前に現在の DB をタイムスタンプ付き安全コピー
   * (`.restore-safety-<epoch>`) として退避する。
   *
   * @throws 指定世代のバックアップが存在しない場合 Error を投げる
   */
  restoreFromBackup(generation: number): { restoredFrom: string; safetyCopy: string | null } {
    const gzPath = this.backupPath(generation);
    const plainPath = this.uncompressedBackupPath(generation);
    // TOCTOU 競合を避けるため existsSync を使わず、直接 read を試みて ENOENT で判定。
    let compressed: Buffer | null = null;
    try {
      compressed = fs.readFileSync(gzPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      // gzip 世代が無ければ非圧縮世代（2 GiB 超で gzip を諦めた場合）を探す
      if (!fs.existsSync(plainPath)) {
        throw new Error(`Backup not found: ${gzPath}`);
      }
    }
    this.preWriteGuard?.(this.dbPath);
    let safetyCopy: string | null = null;
    const safetyPath = `${this.dbPath}.restore-safety-${Date.now()}`;
    try {
      fs.copyFileSync(this.dbPath, safetyPath, fs.constants.COPYFILE_EXCL);
      safetyCopy = safetyPath;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOENT: 既存 DB なしのため safetyCopy は作らない
      // EEXIST: 同時呼び出しで衝突、こちらの copy は諦める
      if (code !== 'ENOENT' && code !== 'EEXIST') throw err;
    }
    if (compressed !== null) {
      fs.writeFileSync(this.dbPath, zlib.gunzipSync(compressed));
      return { restoredFrom: gzPath, safetyCopy };
    }
    // 非圧縮世代は Buffer を経由せずコピーで戻す（2 GiB 超でも復元できる）
    fs.copyFileSync(plainPath, this.dbPath);
    return { restoredFrom: plainPath, safetyCopy };
  }

  /** 実在する世代ファイル（gzip 優先、無ければ非圧縮）。どちらも無ければ null。 */
  private existingBackupPath(generation: number): string | null {
    const gzPath = this.backupPath(generation);
    if (fs.existsSync(gzPath)) return gzPath;
    const plainPath = this.uncompressedBackupPath(generation);
    return fs.existsSync(plainPath) ? plainPath : null;
  }
}

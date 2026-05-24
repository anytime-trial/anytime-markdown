/**
 * Ollama 熱負荷スロットリングの設定 (lep.json `throttle` から渡す)。
 * 設計: plan/20260524-ollama-thermal-throttle-design.ja.md。
 */
export interface OllamaThrottleOptions {
  /** 機能全体の on/off。false なら governor は完全な passthrough。 */
  enabled: boolean;
  /** embeddings レイテンシが baseline×これを超えたら COOLING。 */
  slowdownFactor: number;
  /** COOLING 窓の秒数。起動時 start slow にも使う。 */
  cooldownSec: number;
  /** 連続稼働の上限分。超過で COOLING。 */
  maxContinuousMin: number;
}

/** テスト用に clock / sleep を注入するシーム。省略時は実時間。 */
export interface OllamaThrottleDeps {
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export type ThrottleState = 'NORMAL' | 'COOLING';
export type OllamaOp = 'generate' | 'embeddings';

const IDLE_RESET_MS = 60_000;

const defaultDeps: OllamaThrottleDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class OllamaThrottleGovernor {
  private coolingUntil = 0;
  private busySince: number | null = null;
  private lastActivityAt: number | null = null;
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: OllamaThrottleOptions,
    private readonly deps: OllamaThrottleDeps = defaultDeps,
  ) {
    // start slow: 起動直後は cooldownSec だけ COOLING で始める。
    if (this.opts.enabled) {
      this.coolingUntil = this.deps.now() + this.opts.cooldownSec * 1000;
    }
  }

  state(): ThrottleState {
    return this.deps.now() < this.coolingUntil ? 'COOLING' : 'NORMAL';
  }

  /** スケジューラが背景 run の起動を見送るべきか。 */
  shouldDeferScheduled(): boolean {
    return this.opts.enabled && this.state() === 'COOLING';
  }

  /**
   * 1 リクエストを直列化 + COOLING 待機しつつ実行し、レイテンシを計測して状態を更新する。
   * disabled 時は素通し。
   */
  async run<T>(op: OllamaOp, model: string, fn: () => Promise<T>): Promise<T> {
    if (!this.opts.enabled) return fn();
    const release = await this.acquire();
    const startedAt = this.deps.now();
    try {
      const result = await fn();
      this.report(op, model, this.deps.now() - startedAt, true);
      return result;
    } catch (err) {
      const code = (err as { code?: string }).code;
      this.report(op, model, this.deps.now() - startedAt, false, code);
      throw err;
    } finally {
      release();
    }
  }

  /** 直列化スロットを取得し、COOLING 中なら明けるまで待つ。busy streak を更新する。 */
  private async acquire(): Promise<() => void> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prev;

    while (this.state() === 'COOLING') {
      const remaining = this.coolingUntil - this.deps.now();
      if (remaining <= 0) break;
      await this.deps.sleep(remaining);
    }

    const now = this.deps.now();
    if (this.lastActivityAt !== null && now - this.lastActivityAt > IDLE_RESET_MS) {
      this.busySince = now; // アイドル後の再開は新しい streak
    } else if (this.busySince === null) {
      this.busySince = now;
    }
    this.lastActivityAt = now;
    return release;
  }

  /** リクエスト完了後の状態更新 (COOLING 突入判定)。Task 3/4 で中身を実装する。 */
  private report(_op: OllamaOp, _model: string, _latencyMs: number, _ok: boolean, _errorCode?: string): void {
    // 検知ロジックは Task 3 (embeddings) / Task 4 (error・連続稼働) で実装する。
  }
}

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

const defaultDeps: OllamaThrottleDeps = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export class OllamaThrottleGovernor {
  private coolingUntil = 0;

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
}

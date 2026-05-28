// trail-server/runtime subpath: extension が root barrel を経由せずに参照する
// 軽量 runtime ヘルパー（node:fs / node:path のみに依存）の clean re-export。

export { DaemonLifecycle } from './runtime/DaemonLifecycle';
export type { DaemonInfo, DaemonLifecycleOptions } from './runtime/DaemonLifecycle';

// trail-server の pipeline 層公開面。
//
// typescript を引き込む MemoryCoreService 系の **値** を export する。
// 拡張ホスト (extension.js) はこの subpath を import しない。trail-daemon child
// process または trail-server の cli 等、analyzer 実行側のみが使用する。

export {
  MemoryCoreService,
  defaultStatePath as memoryCoreServiceDefaultStatePath,
} from '@anytime-markdown/memory-core/pipeline';

// memoryCoreRunner も MemoryCoreService 値を引くため pipeline 経路に閉じこめる。
export { createMemoryCoreRunner } from './runtime/memoryCoreRunner';

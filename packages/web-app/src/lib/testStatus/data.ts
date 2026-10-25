import meansJson from '../../../data/test-status/means.json';
import packagesJson from '../../../data/test-status/packages.json';
import type { MeansDataset, TestStatusSnapshot } from './types';

/**
 * テスト実施状況のスナップショットを型付きで公開する。
 *
 * Why not: JSON を各コンポーネントから直接 import しない。resolveJsonModule が推論する
 * リテラル型では `result` や `state` が出現値の合併に広がるため、境界をここ 1 箇所に閉じる。
 */
export const TEST_STATUS_SNAPSHOT = packagesJson as unknown as TestStatusSnapshot;

export const TEST_MEANS = meansJson as unknown as MeansDataset;

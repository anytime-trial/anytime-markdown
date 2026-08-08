import type { C4Element } from '../../types';
import { buildArchitectureMatrix, type ArchitectureFileEntry } from '../buildArchitectureMatrix';

const elements: readonly C4Element[] = [
  { id: 'sys_app', type: 'system', name: 'app' },
  { id: 'pkg_web', type: 'container', name: 'web', boundaryId: 'sys_app' },
  { id: 'pkg_web/components', type: 'component', name: 'components', boundaryId: 'pkg_web' },
  { id: 'pkg_web/utils', type: 'component', name: 'utils', boundaryId: 'pkg_web' },
  { id: 'file::packages/web/src/components/Button.tsx', type: 'code', name: 'Button.tsx', boundaryId: 'pkg_web/components' },
  { id: 'file::packages/web/src/components/Card.tsx', type: 'code', name: 'Card.tsx', boundaryId: 'pkg_web/components' },
  { id: 'file::packages/web/src/utils/format.ts', type: 'code', name: 'format.ts', boundaryId: 'pkg_web/utils' },
  { id: 'file::packages/web/src/utils/parse.ts', type: 'code', name: 'parse.ts', boundaryId: 'pkg_web/utils' },
  { id: 'file::packages/web/src/utils/types.ts', type: 'code', name: 'types.ts', boundaryId: 'pkg_web/utils' },
];

const fileEntries: readonly ArchitectureFileEntry[] = [
  { elementId: 'file::packages/web/src/components/Button.tsx', category: 'ui' },
  { elementId: 'file::packages/web/src/components/Card.tsx', category: 'ui' },
  { elementId: 'file::packages/web/src/utils/format.ts', category: 'logic' },
  { elementId: 'file::packages/web/src/utils/parse.ts', category: 'logic' },
  { elementId: 'file::packages/web/src/utils/types.ts', category: 'excluded' },
];

describe('buildArchitectureMatrix', () => {
  it('L4 (code) ui ファイルは ratio=1', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['file::packages/web/src/components/Button.tsx']).toEqual({
      uiCount: 1,
      logicCount: 0,
      ratio: 1,
    });
  });

  it('L4 (code) logic ファイルは ratio=0', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['file::packages/web/src/utils/format.ts']).toEqual({
      uiCount: 0,
      logicCount: 1,
      ratio: 0,
    });
  });

  it('L4 (code) excluded ファイルは出力に含まれない', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['file::packages/web/src/utils/types.ts']).toBeUndefined();
  });

  it('L3 (component) で全 UI なら ratio=1', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['pkg_web/components']).toEqual({
      uiCount: 2,
      logicCount: 0,
      ratio: 1,
    });
  });

  it('L3 (component) で全 logic なら ratio=0、excluded は分母から除外', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['pkg_web/utils']).toEqual({
      uiCount: 0,
      logicCount: 2,
      ratio: 0,
    });
  });

  it('L2 (container) で混在すると ratio = uiCount / (ui + logic)', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['pkg_web']).toEqual({
      uiCount: 2,
      logicCount: 2,
      ratio: 0.5,
    });
  });

  it('L1 (system) も同様に集計', () => {
    const m = buildArchitectureMatrix(fileEntries, elements);
    expect(m['sys_app']).toEqual({
      uiCount: 2,
      logicCount: 2,
      ratio: 0.5,
    });
  });

  it('集計対象が無い要素は出力に含まれない', () => {
    const onlyExcluded: readonly ArchitectureFileEntry[] = [
      { elementId: 'file::packages/web/src/utils/types.ts', category: 'excluded' },
    ];
    const m = buildArchitectureMatrix(onlyExcluded, elements);
    expect(m['pkg_web/utils']).toBeUndefined();
    expect(m['pkg_web']).toBeUndefined();
    expect(m['sys_app']).toBeUndefined();
  });

  it('fileEntries に無い code 要素は集計に影響しない', () => {
    const partial: readonly ArchitectureFileEntry[] = [
      { elementId: 'file::packages/web/src/components/Button.tsx', category: 'ui' },
    ];
    const m = buildArchitectureMatrix(partial, elements);
    expect(m['pkg_web/components']).toEqual({
      uiCount: 1,
      logicCount: 0,
      ratio: 1,
    });
    // utils 配下は entry が無いので出力なし
    expect(m['pkg_web/utils']).toBeUndefined();
  });
});

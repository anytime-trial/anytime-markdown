import { buildLayerMatrix } from '../buildLayerMatrix';
import type { ArchitectureLayer } from '../../../codeGraph';
import type { C4Element } from '../../types';

function code(id: string, boundaryId?: string): C4Element {
  return { id, type: 'code', name: id, boundaryId };
}
function container(id: string): C4Element {
  return { id, type: 'container', name: id };
}

describe('buildLayerMatrix', () => {
  it('assigns a code element the layer of its package', () => {
    const elements: C4Element[] = [code('file::packages/trail-db/src/db.ts')];
    const layerByPkg = new Map<string, ArchitectureLayer>([['trail-db', 'data']]);
    const matrix = buildLayerMatrix(elements, layerByPkg);
    expect(matrix['file::packages/trail-db/src/db.ts']).toBe('data');
  });

  it('omits code elements whose package has no resolved layer', () => {
    const elements: C4Element[] = [code('file::packages/unknown/src/x.ts')];
    const matrix = buildLayerMatrix(elements, new Map());
    expect(matrix['file::packages/unknown/src/x.ts']).toBeUndefined();
  });

  it('assigns a boundary element the dominant layer of its descendant code elements', () => {
    const elements: C4Element[] = [
      container('container::pkg'),
      code('file::packages/a-db/src/x.ts', 'container::pkg'),
      code('file::packages/a-db/src/y.ts', 'container::pkg'),
      code('file::packages/b-viewer/src/z.ts', 'container::pkg'),
    ];
    const layerByPkg = new Map<string, ArchitectureLayer>([
      ['a-db', 'data'],
      ['b-viewer', 'presentation-ui'],
    ]);
    const matrix = buildLayerMatrix(elements, layerByPkg);
    // a-db(data) が 2 件、b-viewer(presentation-ui) が 1 件 → 最頻は data。
    expect(matrix['container::pkg']).toBe('data');
  });
});

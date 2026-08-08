import { c4ToGraphDocument } from '../transform/toGraphDocument';
import type { C4Model, BoundaryInfo } from '../types';

const BASE_MODEL: C4Model = {
  level: 'container',
  elements: [
    { id: 'sys1', type: 'system', name: 'My System' },
    { id: 'pkg1', type: 'container', name: 'Web App', boundaryId: 'sys1' },
  ],
  relationships: [],
};

describe('c4ToGraphDocument', () => {
  it('Phase-2 frame gets c4Type metadata', () => {
    const doc = c4ToGraphDocument(BASE_MODEL);
    const sysFrame = doc.nodes.find(n => n.metadata?.c4Id === 'sys1');
    expect(sysFrame?.type).toBe('frame');
    expect(sysFrame?.metadata?.c4Type).toBe('system');
  });

  it('Phase-1 frame is enriched with c4Type in Phase-2', () => {
    const boundaries: BoundaryInfo[] = [{ id: 'sys1', name: 'My System' }];
    const doc = c4ToGraphDocument(BASE_MODEL, boundaries);
    const sysFrame = doc.nodes.find(n => n.metadata?.c4Id === 'sys1');
    expect(sysFrame?.type).toBe('frame');
    expect(sysFrame?.metadata?.c4Type).toBe('system');
  });

  it('container frame inside Phase-1 system frame gets groupId', () => {
    const boundaries: BoundaryInfo[] = [{ id: 'sys1', name: 'My System' }];
    const doc = c4ToGraphDocument(BASE_MODEL, boundaries);
    const sysFrameId = doc.nodes.find(n => n.metadata?.c4Id === 'sys1')?.id;
    const pkgFrame = doc.nodes.find(n => n.metadata?.c4Id === 'pkg1');
    expect(pkgFrame?.type).toBe('frame');
    expect(pkgFrame?.groupId).toBe(sysFrameId);
  });
});

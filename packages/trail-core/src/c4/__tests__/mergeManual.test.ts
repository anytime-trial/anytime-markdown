import { mergeManualIntoC4Model } from '../mergeManual';
import type { C4Model } from '../types';
import type { ManualElement, ManualRelationship } from '../manualTypes';

describe('mergeManualIntoC4Model', () => {
  const baseModel: C4Model = {
    level: 'container',
    elements: [
      { id: 'pkg_web-app', type: 'container', name: 'web-app' },
      { id: 'pkg_trail-core', type: 'container', name: 'trail-core' },
    ],
    relationships: [
      { from: 'pkg_web-app', to: 'pkg_trail-core' },
    ],
  };

  it('appends manual L1 elements with manual:true flag', () => {
    const manualElements: ManualElement[] = [{
      id: 'person_1', type: 'person', name: 'User',
      external: false, parentId: null, updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const result = mergeManualIntoC4Model(baseModel, manualElements, []);
    expect(result.elements).toHaveLength(3);
    const manual = result.elements.find(e => e.id === 'person_1');
    expect(manual).toBeDefined();
    expect((manual as any).manual).toBe(true);
  });

  it('filters out L2 manual element with non-existent parent (cascade)', () => {
    const manualElements: ManualElement[] = [{
      id: 'pkg_manual_1', type: 'container', name: 'Redis',
      external: true, parentId: 'sys_ghost', updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const result = mergeManualIntoC4Model(baseModel, manualElements, []);
    expect(result.elements).toHaveLength(2);
    expect(result.elements.some(e => e.id === 'pkg_manual_1')).toBe(false);
  });

  it('keeps L2 manual element when parent is an auto element', () => {
    const manualElements: ManualElement[] = [{
      id: 'pkg_manual_1', type: 'container', name: 'Redis',
      external: true, parentId: 'pkg_web-app', updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const result = mergeManualIntoC4Model(baseModel, manualElements, []);
    expect(result.elements).toHaveLength(3);
    const elem = result.elements.find(e => e.id === 'pkg_manual_1');
    expect(elem?.boundaryId).toBe('pkg_web-app');
  });

  it('keeps manual relationship when both ends are live', () => {
    const manualElements: ManualElement[] = [{
      id: 'person_1', type: 'person', name: 'User',
      external: false, parentId: null, updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const manualRels: ManualRelationship[] = [{
      id: 'rel_manual_1', fromId: 'person_1', toId: 'pkg_web-app',
      updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const result = mergeManualIntoC4Model(baseModel, manualElements, manualRels);
    expect(result.relationships).toHaveLength(2);
    const manual = result.relationships.find(r => r.from === 'person_1');
    expect(manual).toBeDefined();
    expect((manual as any).manual).toBe(true);
  });

  it('drops manual relationship when one end is dead', () => {
    const manualRels: ManualRelationship[] = [{
      id: 'rel_manual_1', fromId: 'person_ghost', toId: 'pkg_web-app',
      updatedAt: '2026-04-20T00:00:00.000Z',
    }];
    const result = mergeManualIntoC4Model(baseModel, [], manualRels);
    expect(result.relationships).toHaveLength(1);
  });

  it('serviceType is propagated from ManualElement to C4Element', () => {
    const manualElements: ManualElement[] = [{
      id: 'pkg_manual_1', type: 'container', name: 'Supabase',
      external: true, parentId: null, updatedAt: '2026-04-20T00:00:00.000Z',
      serviceType: 'supabase',
    }];
    const result = mergeManualIntoC4Model(baseModel, manualElements, []);
    const elem = result.elements.find(e => e.id === 'pkg_manual_1');
    expect(elem?.serviceType).toBe('supabase');
  });
});

import { AUTO_LAYER_SOURCE, seedLayerContainers } from '../seedLayerContainers';
import type { LayerSeedDb, SeededElement } from '../seedLayerContainers';

interface SaveCall {
  readonly repoName: string;
  readonly type: string;
  readonly name: string;
  readonly serviceType?: string;
  readonly parentId: string | null;
}

class FakeDb implements LayerSeedDb {
  readonly saveCalls: SaveCall[] = [];
  updateCalls = 0;
  deleteCalls = 0;
  constructor(private elements: SeededElement[] = []) {}

  getManualElements(_repoName: string): readonly SeededElement[] {
    return this.elements;
  }
  saveManualElement(
    repoName: string,
    input: { type: string; name: string; external: boolean; parentId: string | null; serviceType?: string },
  ): string {
    this.saveCalls.push({ repoName, type: input.type, name: input.name, serviceType: input.serviceType, parentId: input.parentId });
    const id = `${input.type[0]}${this.saveCalls.length}`;
    // 後続呼び出しの冪等判定に反映させる（実 DB の挙動を模倣）。
    this.elements = [...this.elements, { name: input.name, type: input.type, serviceType: input.serviceType }];
    return id;
  }
}

describe('seedLayerContainers', () => {
  it('creates one auto container per unique layer on an empty repo', () => {
    const db = new FakeDb();
    const result = seedLayerContainers(db, 'repo', ['data', 'foundation', 'data']);
    expect(result.created.sort()).toEqual(['data', 'foundation']);
    expect(db.saveCalls).toHaveLength(2);
    for (const call of db.saveCalls) {
      expect(call.type).toBe('container');
      expect(call.serviceType).toBe(AUTO_LAYER_SOURCE);
      expect(call.parentId).toBeNull();
    }
  });

  it('is idempotent: re-seeding existing auto containers creates nothing', () => {
    const db = new FakeDb([
      { name: 'data', type: 'container', serviceType: AUTO_LAYER_SOURCE },
      { name: 'foundation', type: 'container', serviceType: AUTO_LAYER_SOURCE },
    ]);
    const result = seedLayerContainers(db, 'repo', ['data', 'foundation']);
    expect(result.created).toEqual([]);
    expect(db.saveCalls).toHaveLength(0);
  });

  it('adds only the missing auto container when some already exist', () => {
    const db = new FakeDb([{ name: 'data', type: 'container', serviceType: AUTO_LAYER_SOURCE }]);
    const result = seedLayerContainers(db, 'repo', ['data', 'integration']);
    expect(result.created).toEqual(['integration']);
    expect(db.saveCalls).toHaveLength(1);
  });

  it('does NOT seed when the repo has any user-created (non-auto) element', () => {
    const db = new FakeDb([{ name: 'My Container', type: 'container', serviceType: undefined }]);
    const result = seedLayerContainers(db, 'repo', ['data', 'foundation']);
    expect(result.created).toEqual([]);
    expect(result.skipped).toBe('user-elements-present');
    expect(db.saveCalls).toHaveLength(0);
  });

  it('never updates or deletes existing elements (non-destructive)', () => {
    const db = new FakeDb([{ name: 'data', type: 'container', serviceType: AUTO_LAYER_SOURCE }]);
    seedLayerContainers(db, 'repo', ['data', 'integration']);
    expect(db.updateCalls).toBe(0);
    expect(db.deleteCalls).toBe(0);
  });
});

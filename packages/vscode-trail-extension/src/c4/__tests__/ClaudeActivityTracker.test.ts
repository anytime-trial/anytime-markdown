import { ClaudeActivityTracker } from '../ClaudeActivityTracker';
import type { C4Model } from '@anytime-markdown/trail-core/c4';

const workspaceRoot = '/workspace';

/** テスト用シンプルモデル: system > container > component > code */
const model: C4Model = {
  level: 'code',
  elements: [
    { id: 'sys_app', type: 'system', name: 'App' },
    { id: 'pkg_core', type: 'container', name: 'Core', boundaryId: 'sys_app' },
    { id: 'pkg_core/service', type: 'component', name: 'Service', boundaryId: 'pkg_core' },
    { id: 'file::src/service.ts', type: 'code', name: 'service.ts', boundaryId: 'pkg_core/service' },
    { id: 'file::src/util.ts', type: 'code', name: 'util.ts', boundaryId: 'pkg_core/service' },
  ],
  relationships: [],
};

describe('ClaudeActivityTracker', () => {
  let tracker: ClaudeActivityTracker;

  beforeEach(() => {
    tracker = new ClaudeActivityTracker();
    tracker.setModel(model, workspaceRoot);
  });

  afterEach(() => {
    tracker.dispose();
  });

  describe('onFileEditing', () => {
    it('known file: activeElementIds に要素と全祖先が含まれる', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/service.ts`);
      const state = tracker.getState();
      expect(state.activeElementIds).toContain('file::src/service.ts');
      expect(state.activeElementIds).toContain('pkg_core/service');
      expect(state.activeElementIds).toContain('pkg_core');
      expect(state.activeElementIds).toContain('sys_app');
    });

    it('editing: false で activeElementIds が空になる', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/service.ts`);
      tracker.onFileEditing(false, `${workspaceRoot}/src/service.ts`);
      expect(tracker.getState().activeElementIds).toHaveLength(0);
    });

    it('touchedElementIds は editing: false 後も保持される', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/service.ts`);
      tracker.onFileEditing(false, `${workspaceRoot}/src/service.ts`);
      const state = tracker.getState();
      expect(state.touchedElementIds).toContain('file::src/service.ts');
      expect(state.touchedElementIds).toContain('pkg_core');
    });

    it('複数ファイルの変更が touchedElementIds に累積される', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/service.ts`);
      tracker.onFileEditing(true, `${workspaceRoot}/src/util.ts`);
      const state = tracker.getState();
      expect(state.touchedElementIds).toContain('file::src/service.ts');
      expect(state.touchedElementIds).toContain('file::src/util.ts');
    });

    it('C4モデルに存在しないファイルは無視される', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/unknown.ts`);
      expect(tracker.getState().activeElementIds).toHaveLength(0);
      expect(tracker.getState().touchedElementIds).toHaveLength(0);
    });

    it('ワークスペース外のファイルは無視される', () => {
      tracker.onFileEditing(true, '/other/src/service.ts');
      expect(tracker.getState().activeElementIds).toHaveLength(0);
    });
  });

  describe('resetTouched', () => {
    it('touchedElementIds と activeElementIds がクリアされる', () => {
      tracker.onFileEditing(true, `${workspaceRoot}/src/service.ts`);
      tracker.resetTouched();
      const state = tracker.getState();
      expect(state.activeElementIds).toHaveLength(0);
      expect(state.touchedElementIds).toHaveLength(0);
    });
  });

  describe('setModel', () => {
    it('モデル更新後に新しいマッピングで動作する', () => {
      const newModel: C4Model = {
        level: 'code',
        elements: [
          { id: 'sys_new', type: 'system', name: 'New' },
          { id: 'file::src/new.ts', type: 'code', name: 'new.ts', boundaryId: 'sys_new' },
        ],
        relationships: [],
      };
      tracker.setModel(newModel, workspaceRoot);
      tracker.onFileEditing(true, `${workspaceRoot}/src/new.ts`);
      expect(tracker.getState().activeElementIds).toContain('file::src/new.ts');
      expect(tracker.getState().activeElementIds).toContain('sys_new');
    });
  });
});

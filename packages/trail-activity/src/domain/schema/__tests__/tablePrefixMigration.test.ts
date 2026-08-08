import {
  ACTIVITY_TABLE_RENAMES,
  CARAVAN_FLIGHT_RECORD_RENAMES,
  planTableRenames,
} from '../tablePrefixMigration';

describe('planTableRenames', () => {
  it('旧名が実在し新名が不在のテーブルだけ ALTER を生成する', () => {
    const statements = planTableRenames(new Set(['sessions', 'activity_messages']), [
      { from: 'sessions', to: 'activity_sessions' },
      { from: 'messages', to: 'activity_messages' },
      { from: 'repos', to: 'activity_repos' },
    ]);
    expect(statements).toEqual(['ALTER TABLE sessions RENAME TO activity_sessions']);
  });

  it('新旧が同時に実在する場合はリネームせず衝突として報告する', () => {
    const statements = planTableRenames(new Set(['sessions', 'activity_sessions']), [
      { from: 'sessions', to: 'activity_sessions' },
    ]);
    expect(statements).toEqual([]);
  });

  it('対象が空なら空配列（冪等: 2 回目の適用で no-op）', () => {
    expect(planTableRenames(new Set(), ACTIVITY_TABLE_RENAMES)).toEqual([]);
  });
});

describe('リネーム対応表', () => {
  it('activity 側は全エントリが activity_ 接頭辞へ向かう', () => {
    for (const { from, to } of ACTIVITY_TABLE_RENAMES) {
      expect(to).toBe(`activity_${from}`);
    }
  });

  it('caravan Flight Record 側は全エントリが caravan_ 接頭辞へ向かう', () => {
    for (const { from, to } of CARAVAN_FLIGHT_RECORD_RENAMES) {
      expect(to).toBe(`caravan_${from}`);
    }
    expect(CARAVAN_FLIGHT_RECORD_RENAMES.map((r) => r.from).sort()).toEqual([
      'acceptance_records',
      'doctrine_judgments',
      'flight_reviews',
      'instruction_sessions',
      'instructions',
    ]);
  });

  it('activity 側の対応表に Flight Record 系（caravan 所在）を含まない', () => {
    const activityFroms = new Set(ACTIVITY_TABLE_RENAMES.map((r) => r.from));
    for (const { from } of CARAVAN_FLIGHT_RECORD_RENAMES) {
      expect(activityFroms.has(from)).toBe(false);
    }
  });
});

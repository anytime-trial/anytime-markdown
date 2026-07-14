import { BackupTreeItem } from '../DatabaseProvider';

// バックアップ mtime はローカル TZ で表示する。WSL の Extension Host は system TZ が UTC のため、
// timeZone を指定しない toLocaleString() では 9 時間ずれる。期待値固定のため TZ を明示する。
describe('BackupTreeItem', () => {
  const originalTz = process.env.TZ;

  beforeEach(() => {
    process.env.TZ = 'Asia/Tokyo';
  });

  afterEach(() => {
    if (originalTz === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTz;
    }
  });

  it('shows the backup mtime in the local time zone, not UTC', () => {
    const item = new BackupTreeItem('/db/trail.db', 1, new Date('2026-05-16T10:23:45.000Z'), 12_897_280);

    // JST は UTC+9 なので 19 時台。UTC のままなら 10 時台になる。
    expect(String(item.description)).toContain('19:23:45');
    expect(String(item.description)).not.toContain('10:23:45');
    expect(String(item.tooltip)).toContain('19:23:45');
    expect(String(item.tooltip)).toContain('12.30 MB (gzip)');
  });

  it('follows the switched time zone (no module-load-time freeze)', () => {
    process.env.TZ = 'America/New_York';
    const item = new BackupTreeItem('/db/trail.db', 2, new Date('2026-05-16T10:23:45.000Z'), 1024);

    expect(String(item.description)).toContain('06:23:45');
  });

  it('marks the newest generation with a distinct contextValue', () => {
    const latest = new BackupTreeItem('/db/trail.db', 1, new Date('2026-05-16T10:23:45.000Z'), 1024);
    const older = new BackupTreeItem('/db/trail.db', 2, new Date('2026-05-15T10:23:45.000Z'), 1024);

    expect(latest.contextValue).toBe('backupEntryLatest');
    expect(older.contextValue).toBe('backupEntryOlder');
  });
});

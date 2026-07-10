import { parseDriveOpenState } from '../lib/driveOpenState';

describe('parseDriveOpenState', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('action: open', () => {
    it('extracts the first file id', () => {
      const raw = JSON.stringify({ ids: ['file-1'], action: 'open', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toEqual({
        action: 'open',
        fileId: 'file-1',
        userId: 'user-1',
      });
    });

    it('picks the first string id when several are present', () => {
      const raw = JSON.stringify({ ids: ['file-1', 'file-2'], action: 'open', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toMatchObject({ fileId: 'file-1' });
    });

    it('skips non-string ids', () => {
      const raw = JSON.stringify({ ids: [7, '', 'file-2'], action: 'open', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toMatchObject({ fileId: 'file-2' });
    });

    it('returns null when ids is empty', () => {
      expect(parseDriveOpenState(JSON.stringify({ ids: [], action: 'open' }))).toBeNull();
    });

    it('returns null when ids holds no usable string', () => {
      expect(parseDriveOpenState(JSON.stringify({ ids: [1, null], action: 'open' }))).toBeNull();
    });

    it('returns null when ids is missing', () => {
      expect(parseDriveOpenState(JSON.stringify({ action: 'open' }))).toBeNull();
    });
  });

  describe('action: create', () => {
    it('extracts the folder id', () => {
      const raw = JSON.stringify({ action: 'create', folderId: 'folder-1', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toEqual({
        action: 'create',
        folderId: 'folder-1',
        userId: 'user-1',
      });
    });

    it('allows a missing folder id', () => {
      const raw = JSON.stringify({ action: 'create', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toEqual({
        action: 'create',
        folderId: null,
        userId: 'user-1',
      });
    });
  });

  describe('userId', () => {
    it('is null when absent', () => {
      const raw = JSON.stringify({ ids: ['file-1'], action: 'open' });
      expect(parseDriveOpenState(raw)).toMatchObject({ userId: null });
    });

    it('is null when not a string', () => {
      const raw = JSON.stringify({ ids: ['file-1'], action: 'open', userId: 42 });
      expect(parseDriveOpenState(raw)).toMatchObject({ userId: null });
    });
  });

  describe('untrusted input', () => {
    it('returns null for a null raw value', () => {
      expect(parseDriveOpenState(null)).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(parseDriveOpenState('')).toBeNull();
    });

    it('returns null and warns for malformed JSON', () => {
      expect(parseDriveOpenState('{ not json')).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
    });

    it('returns null for a JSON null literal', () => {
      expect(parseDriveOpenState('null')).toBeNull();
    });

    it('returns null for a non-object JSON value', () => {
      expect(parseDriveOpenState('"open"')).toBeNull();
      expect(parseDriveOpenState('[1,2]')).toBeNull();
    });

    it('returns null for an unknown action', () => {
      const raw = JSON.stringify({ ids: ['file-1'], action: 'delete', userId: 'user-1' });
      expect(parseDriveOpenState(raw)).toBeNull();
    });

    it('returns null when action is missing', () => {
      expect(parseDriveOpenState(JSON.stringify({ ids: ['file-1'] }))).toBeNull();
    });
  });
});

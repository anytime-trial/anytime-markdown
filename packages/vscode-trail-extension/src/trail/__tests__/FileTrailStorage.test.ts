import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FileTrailStorage } from '../ITrailStorage';

describe('FileTrailStorage', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trail-file-storage-'));
    dbPath = path.join(dir, 'trail.db');
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('readInitialBytes returns null when DB does not exist yet', () => {
    const storage = new FileTrailStorage(dbPath);
    expect(storage.readInitialBytes()).toBeNull();
  });

  it('readInitialBytes returns existing buffer', () => {
    fs.writeFileSync(dbPath, Buffer.from([1, 2, 3]));
    const storage = new FileTrailStorage(dbPath);
    const bytes = storage.readInitialBytes();
    expect(Array.from(bytes!)).toEqual([1, 2, 3]);
  });

  it('first save() rotates existing DB to .bak.1', () => {
    fs.writeFileSync(dbPath, Buffer.from('original'));
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('new-content'));

    expect(fs.readFileSync(dbPath).toString()).toBe('new-content');
    expect(fs.readFileSync(`${dbPath}.bak.1`).toString()).toBe('original');
    expect(fs.existsSync(`${dbPath}.bak.2`)).toBe(false);
  });

  it('subsequent saves within same session do NOT re-rotate', () => {
    fs.writeFileSync(dbPath, Buffer.from('gen-A'));
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('gen-B'));
    storage.save(Buffer.from('gen-C'));
    storage.save(Buffer.from('gen-D'));

    expect(fs.readFileSync(dbPath).toString()).toBe('gen-D');
    // .bak.1 はセッション開始時の原本のまま
    expect(fs.readFileSync(`${dbPath}.bak.1`).toString()).toBe('gen-A');
    expect(fs.existsSync(`${dbPath}.bak.2`)).toBe(false);
  });

  it('new session shifts generations: bak.1 → bak.2, original → bak.1', () => {
    // 初回セッション
    fs.writeFileSync(dbPath, Buffer.from('A'));
    new FileTrailStorage(dbPath).save(Buffer.from('B'));
    // 2 回目セッション（新インスタンス）
    new FileTrailStorage(dbPath).save(Buffer.from('C'));

    expect(fs.readFileSync(dbPath).toString()).toBe('C');
    expect(fs.readFileSync(`${dbPath}.bak.1`).toString()).toBe('B');
    expect(fs.readFileSync(`${dbPath}.bak.2`).toString()).toBe('A');
    expect(fs.existsSync(`${dbPath}.bak.3`)).toBe(false);
  });

  it('keeps at most 3 generations; oldest is discarded', () => {
    fs.writeFileSync(dbPath, Buffer.from('G0'));
    new FileTrailStorage(dbPath).save(Buffer.from('G1'));
    new FileTrailStorage(dbPath).save(Buffer.from('G2'));
    new FileTrailStorage(dbPath).save(Buffer.from('G3'));
    new FileTrailStorage(dbPath).save(Buffer.from('G4'));

    expect(fs.readFileSync(dbPath).toString()).toBe('G4');
    expect(fs.readFileSync(`${dbPath}.bak.1`).toString()).toBe('G3');
    expect(fs.readFileSync(`${dbPath}.bak.2`).toString()).toBe('G2');
    expect(fs.readFileSync(`${dbPath}.bak.3`).toString()).toBe('G1');
    // G0 は世代外にあふれて消える
    expect(fs.existsSync(`${dbPath}.bak.4`)).toBe(false);
  });

  it('first save() on fresh path creates file without rotation', () => {
    const storage = new FileTrailStorage(dbPath);
    storage.save(Buffer.from('fresh'));
    expect(fs.readFileSync(dbPath).toString()).toBe('fresh');
    expect(fs.existsSync(`${dbPath}.bak.1`)).toBe(false);
  });
});

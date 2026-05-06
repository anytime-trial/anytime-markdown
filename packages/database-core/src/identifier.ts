const VALID = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isSafeIdentifier(name: unknown): name is string {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (!VALID.test(name)) return false;
  if (name.toLowerCase().startsWith('sqlite_')) return false;
  return true;
}

export function assertSafeIdentifier(name: unknown): string {
  if (!isSafeIdentifier(name)) {
    throw new Error(`unsafe identifier: ${JSON.stringify(name)}`);
  }
  return name;
}

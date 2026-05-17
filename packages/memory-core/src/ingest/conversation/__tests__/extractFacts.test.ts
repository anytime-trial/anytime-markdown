import { isAbstractRootCause, parseExtractionResult } from '../extractFacts';

describe('isAbstractRootCause', () => {
  it.each([
    ['Concept'],
    ['Decision'],
    ['Rule'],
    ['Person'],
    ['Project'],
    ['Question'],
    ['Task'],
    ['Skill'],
  ])('flags caused_by -> %s as abstract (drift detector noise source)', (objectType) => {
    expect(isAbstractRootCause('caused_by', objectType)).toBe(true);
  });

  it.each([
    ['File'],
    ['Package'],
    ['Library'],
    ['Tool'],
    ['Commit'],
    ['Bug'],
  ])('allows caused_by -> %s as concrete root cause', (objectType) => {
    expect(isAbstractRootCause('caused_by', objectType)).toBe(false);
  });

  it.each([
    ['relates_to', 'Concept'],
    ['depends_on', 'Decision'],
    ['mentioned_in', 'Rule'],
  ])('does not flag %s -> %s (abstract object types are fine for non-caused_by predicates)', (pred, objType) => {
    expect(isAbstractRootCause(pred, objType)).toBe(false);
  });
});

describe('parseExtractionResult — caused_by filter', () => {
  it('drops caused_by relations whose object is an abstract entity', () => {
    const input = {
      summary: 'test',
      entities: [
        { type: 'Bug', name: 'NullRefBug' },
        { type: 'Concept', name: '不適切な条件分岐' },
        { type: 'File', name: 'src/foo.ts' },
      ],
      relations: [
        { subject: { type: 'Bug', name: 'NullRefBug' }, predicate: 'caused_by', object: { type: 'Concept', name: '不適切な条件分岐' } },
        { subject: { type: 'Bug', name: 'NullRefBug' }, predicate: 'caused_by', object: { type: 'File', name: 'src/foo.ts' } },
      ],
    };
    const result = parseExtractionResult(input);
    expect(result).not.toBeNull();
    expect(result!.relations).toHaveLength(1);
    expect(result!.relations[0].object.type).toBe('File');
  });

  it('keeps non-caused_by relations even if object is abstract', () => {
    const input = {
      summary: 'test',
      entities: [
        { type: 'Package', name: 'foo' },
        { type: 'Concept', name: 'SOLID 原則' },
      ],
      relations: [
        { subject: { type: 'Package', name: 'foo' }, predicate: 'relates_to', object: { type: 'Concept', name: 'SOLID 原則' } },
      ],
    };
    const result = parseExtractionResult(input);
    expect(result!.relations).toHaveLength(1);
    expect(result!.relations[0].predicate).toBe('relates_to');
  });

  it('returns null on malformed input (zod parse failure surface unchanged)', () => {
    expect(parseExtractionResult({ entities: 'not-an-array' })).toBeNull();
  });
});

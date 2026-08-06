import { parseExtractionResult } from '../extractFacts';

describe('parseExtractionResult — caused_by は述語一覧から外れている', () => {
  it.each([
    ['File', 'src/foo.ts'],
    ['Concept', '不適切な条件分岐'],
    ['Commit', 'abc1234'],
  ])('object が %s でも caused_by relation は落とす', (objectType, objectName) => {
    const input = {
      summary: 'test',
      entities: [
        { type: 'Bug', name: 'NullRefBug' },
        { type: objectType, name: objectName },
      ],
      relations: [
        { subject: { type: 'Bug', name: 'NullRefBug' }, predicate: 'caused_by', object: { type: objectType, name: objectName } },
      ],
    };
    const result = parseExtractionResult(input);
    expect(result).not.toBeNull();
    expect(result!.relations).toHaveLength(0);
  });

  it('caused_by だけを落とし、同じ episode の他の relation は残す', () => {
    const input = {
      summary: 'test',
      entities: [
        { type: 'Bug', name: 'NullRefBug' },
        { type: 'File', name: 'src/foo.ts' },
        { type: 'Package', name: 'foo' },
        { type: 'Concept', name: 'SOLID 原則' },
      ],
      relations: [
        { subject: { type: 'Bug', name: 'NullRefBug' }, predicate: 'caused_by', object: { type: 'File', name: 'src/foo.ts' } },
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

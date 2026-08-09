import { parseBbox } from '../TrailDataServer';

describe('parseBbox', () => {
  it('parses minX,minY,maxX,maxY in world coordinates', () => {
    expect(parseBbox('-10,-30,20,10')).toEqual({ minX: -10, minY: -30, maxX: 20, maxY: 10 });
  });

  it('accepts fractional coordinates', () => {
    expect(parseBbox('0.5,-1.25,2.5,3.75')).toEqual({ minX: 0.5, minY: -1.25, maxX: 2.5, maxY: 3.75 });
  });

  it.each([
    ['missing', null],
    ['empty', ''],
    ['three values', '1,2,3'],
    ['five values', '1,2,3,4,5'],
    ['non numeric', '1,2,three,4'],
    ['infinite', '1,2,Infinity,4'],
  ])('treats a %s viewport as "no viewport" rather than a partial filter', (_label, value) => {
    expect(parseBbox(value)).toBeUndefined();
  });

  it.each([
    ['inverted x', '20,-30,-10,10'],
    ['inverted y', '-10,10,20,-30'],
    ['zero width', '5,-30,5,10'],
    ['zero height', '-10,7,20,7'],
  ])('rejects a degenerate viewport (%s)', (_label, value) => {
    // 面積 0 / 反転した矩形は「何も入らない視野」を意味してしまう。全体表示へ倒す
    expect(parseBbox(value)).toBeUndefined();
  });
});

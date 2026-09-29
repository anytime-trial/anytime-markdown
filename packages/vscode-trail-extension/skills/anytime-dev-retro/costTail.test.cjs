const { tailStats } = require('./costTail.cjs');

describe('tailStats', () => {
  test.each([
    [[], { n: 0, medianCost: null, p90Cost: null, top10PctShareCost: null, maxCost: null }],
    [[1.234], { n: 1, medianCost: 1.23, p90Cost: 1.23, top10PctShareCost: 100, maxCost: 1.23 }],
    [[10, 9, 8, 7, 6, 5, 4, 3, 2, 1], { n: 10, medianCost: 5.5, p90Cost: 9, top10PctShareCost: 18.2, maxCost: 10 }],
    [[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1], { n: 11, medianCost: 6, p90Cost: 10, top10PctShareCost: 31.8, maxCost: 11 }],
    [[0, 0, 0], { n: 3, medianCost: 0, p90Cost: 0, top10PctShareCost: null, maxCost: 0 }],
    [[0.004, 0.014], { n: 2, medianCost: 0.01, p90Cost: 0.01, top10PctShareCost: 77.8, maxCost: 0.01 }],
  ])('costs=%j', (costs, expected) => {
    expect(tailStats(Object.freeze(costs))).toEqual(expected);
  });
});

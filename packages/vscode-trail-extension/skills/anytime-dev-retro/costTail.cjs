/** Session cost distribution; sorting never mutates the caller's array. */
function tailStats(costs) {
  const n = costs.length;
  if (n === 0) {
    return { n, medianCost: null, p90Cost: null, top10PctShareCost: null, maxCost: null };
  }
  const sorted = [...costs].sort((a, b) => a - b);
  const mid = Math.floor(n / 2);
  const total = sorted.reduce((sum, cost) => sum + cost, 0);
  const top = sorted.slice(n - Math.ceil(n / 10)).reduce((sum, cost) => sum + cost, 0);
  const round2 = (value) => Math.round(value * 100) / 100;
  return {
    n,
    medianCost: round2(n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2),
    p90Cost: round2(sorted[Math.ceil(0.9 * n) - 1]),
    top10PctShareCost: total === 0 ? null : Math.round(top / total * 1000) / 10,
    maxCost: round2(sorted[n - 1]),
  };
}

module.exports = { tailStats };

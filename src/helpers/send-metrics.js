function computePercentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.ceil(sortedArr.length * p / 100) - 1;
  return sortedArr[Math.max(0, idx)];
}

/**
 * Compute trend as percentage change between two windowed averages.
 * Uses the last WINDOW points as "current" and the WINDOW before that as "previous".
 * Returns { cpu, mem, heap, load, rps, responseTime } with percentage deltas.
 */
function computeTrends(span) {
  const WINDOW = 10; // Number of data points per window
  const os = span.os || [];
  const responses = span.responses || [];

  const trends = {};

  // OS-based trends
  if (os.length >= WINDOW * 2) {
    const recent = os.slice(-WINDOW);
    const previous = os.slice(-(WINDOW * 2), -WINDOW);

    const avg = (arr, fn) => arr.reduce((s, p) => s + (fn(p) || 0), 0) / arr.length;

    const pctChange = (cur, prev) => prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0;

    trends.cpu = pctChange(avg(recent, p => p.cpu), avg(previous, p => p.cpu));
    trends.mem = pctChange(avg(recent, p => p.memory), avg(previous, p => p.memory));
    trends.load = pctChange(
      avg(recent, p => (p.load ? p.load[0] : 0)),
      avg(previous, p => (p.load ? p.load[0] : 0))
    );
    trends.heap = pctChange(
      avg(recent, p => (p.heap ? p.heap.used_heap_size : 0)),
      avg(previous, p => (p.heap ? p.heap.used_heap_size : 0))
    );
  }

  // Response-based trends
  if (responses.length >= WINDOW * 2) {
    const recent = responses.slice(-WINDOW);
    const previous = responses.slice(-(WINDOW * 2), -WINDOW);

    const avg = (arr, fn) => arr.reduce((s, p) => s + (fn(p) || 0), 0) / arr.length;
    const pctChange = (cur, prev) => prev !== 0 ? ((cur - prev) / Math.abs(prev)) * 100 : 0;

    trends.rps = pctChange(avg(recent, p => p.count), avg(previous, p => p.count));
    trends.responseTime = pctChange(avg(recent, p => p.mean), avg(previous, p => p.mean));
  }

  return Object.keys(trends).length > 0 ? trends : null;
}

module.exports = (io, span) => {
  const lastOs = span.os[span.os.length - 2];
  const lastResponse = span.responses[span.responses.length - 2];

  // Compute percentiles if response times are available
  let percentiles = null;
  if (lastResponse && lastResponse.responseTimes && lastResponse.responseTimes.length > 0) {
    const sorted = lastResponse.responseTimes.slice().sort((a, b) => a - b);
    percentiles = {
      p50: computePercentile(sorted, 50),
      p95: computePercentile(sorted, 95),
      p99: computePercentile(sorted, 99),
    };
  }

  // Compute trends from windowed averages
  const trends = computeTrends(span);

  io.emit('esm_stats', {
    os: lastOs,
    responses: lastResponse,
    percentiles,
    trends,
    timestamp: Date.now(),
  });
};

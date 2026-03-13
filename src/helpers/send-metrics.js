function computePercentile(sortedArr, p) {
  if (!sortedArr || sortedArr.length === 0) return 0;
  const idx = Math.ceil(sortedArr.length * p / 100) - 1;
  return sortedArr[Math.max(0, idx)];
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

  io.emit('esm_stats', {
    os: lastOs,
    responses: lastResponse,
    percentiles,
    timestamp: Date.now(),
  });
};

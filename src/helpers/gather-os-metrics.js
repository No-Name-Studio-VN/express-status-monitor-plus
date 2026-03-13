const pidusage = require('pidusage');
const os = require('os');
const v8 = require('v8');
const sendMetrics = require('./send-metrics');
const debug = require('debug')('express-status-monitor');

let eventLoopStats;

try {
  eventLoopStats = require('event-loop-stats');
} catch {
  debug('event-loop-stats not found, ignoring event loop metrics...');
}

// ── Downsampling thresholds ────────────────────────────────────
// Data older than these ages gets merged into coarser buckets.
const DOWNSAMPLE_TIERS = [
  { maxAge: 10 * 60 * 1000, bucketSize: 0 },            // < 10 min → keep full resolution
  { maxAge: 60 * 60 * 1000, bucketSize: 30 * 1000 },    // 10 min–1 hr → 30s buckets
  { maxAge: 24 * 60 * 60 * 1000, bucketSize: 5 * 60 * 1000 }, // 1 hr–24 hr → 5-min buckets
  { maxAge: Infinity, bucketSize: 30 * 60 * 1000 },       // > 24 hr → 30-min buckets
];

/**
 * Average a group of OS data points into a single point.
 */
function averageOsPoints(points) {
  if (points.length === 1) return points[0];
  const n = points.length;
  const avg = {
    cpu: 0,
    memory: 0,
    timestamp: 0,
  };

  const loadSum = [0, 0, 0];
  let heapUsed = 0;
  let lastSystemInfo = null;
  let lastHeap = null;
  let lastMemBreakdown = null;
  let lastLoop = null;

  for (const p of points) {
    avg.cpu += p.cpu || 0;
    avg.memory += p.memory || 0;
    avg.timestamp += p.timestamp || 0;
    if (p.load) {
      loadSum[0] += p.load[0] || 0;
      loadSum[1] += p.load[1] || 0;
      loadSum[2] += p.load[2] || 0;
    }
    if (p.heap) heapUsed += p.heap.used_heap_size || 0;
    if (p.systemInfo) lastSystemInfo = p.systemInfo;
    if (p.heap) lastHeap = p.heap;
    if (p.memoryBreakdown) lastMemBreakdown = p.memoryBreakdown;
    if (p.loop) lastLoop = p.loop;
  }

  avg.cpu /= n;
  avg.memory /= n;
  avg.timestamp = Math.round(avg.timestamp / n);
  avg.load = [loadSum[0] / n, loadSum[1] / n, loadSum[2] / n];

  // For complex objects, keep the last snapshot but average heap
  if (lastHeap) {
    avg.heap = { ...lastHeap, used_heap_size: heapUsed / n };
  }
  if (lastSystemInfo) avg.systemInfo = lastSystemInfo;
  if (lastMemBreakdown) avg.memoryBreakdown = lastMemBreakdown;
  if (lastLoop) avg.loop = lastLoop;

  return avg;
}

/**
 * Average a group of response data points into a single point.
 */
function averageResponsePoints(points) {
  if (points.length === 1) return points[0];
  const n = points.length;
  const avg = { 2: 0, 3: 0, 4: 0, 5: 0, count: 0, mean: 0, timestamp: 0 };

  for (const p of points) {
    avg[2] += p[2] || 0;
    avg[3] += p[3] || 0;
    avg[4] += p[4] || 0;
    avg[5] += p[5] || 0;
    avg.count += p.count || 0;
    avg.mean += (p.mean || 0) * (p.count || 1);
    avg.timestamp += p.timestamp || 0;
  }

  avg.mean = avg.count > 0 ? avg.mean / avg.count : 0;
  avg.timestamp = Math.round(avg.timestamp / n);

  return avg;
}

/**
 * Downsample an array of timestamped data points in-place.
 * Returns the compacted array.
 */
function downsampleArray(arr, averageFn) {
  if (arr.length < 300) return arr; // Don't bother below threshold

  const now = Date.now();
  const result = [];

  // Separate points into tier buckets
  let i = 0;
  while (i < arr.length) {
    const point = arr[i];
    const age = now - (point.timestamp || 0);

    // Find which tier this point belongs to
    const tier = DOWNSAMPLE_TIERS.find(t => age < t.maxAge);
    const bucketSize = tier ? tier.bucketSize : DOWNSAMPLE_TIERS[DOWNSAMPLE_TIERS.length - 1].bucketSize;

    if (bucketSize === 0) {
      // Full resolution — keep as-is
      result.push(point);
      i++;
    } else {
      // Collect all points in the same bucket
      const bucketStart = Math.floor(point.timestamp / bucketSize) * bucketSize;
      const bucket = [point];
      i++;
      while (i < arr.length) {
        const nextTs = arr[i].timestamp || 0;
        const nextAge = now - nextTs;
        const nextTier = DOWNSAMPLE_TIERS.find(t => nextAge < t.maxAge);
        const nextBucketSize = nextTier ? nextTier.bucketSize : DOWNSAMPLE_TIERS[DOWNSAMPLE_TIERS.length - 1].bucketSize;

        if (nextBucketSize !== bucketSize) break;
        const nextBucketStart = Math.floor(nextTs / nextBucketSize) * nextBucketSize;
        if (nextBucketStart !== bucketStart) break;

        bucket.push(arr[i]);
        i++;
      }

      result.push(averageFn(bucket));
    }
  }

  return result;
}

/**
 * Run downsampling on both os and responses arrays for a span.
 */
function downsample(span) {
  span.os = downsampleArray(span.os, averageOsPoints);
  span.responses = downsampleArray(span.responses, averageResponsePoints);
}

module.exports = (io, span, metricsStore) => {
  const defaultResponse = {
    2: 0,
    3: 0,
    4: 0,
    5: 0,
    count: 0,
    mean: 0,
    timestamp: Date.now(),
  };

  pidusage(process.pid, (err, stat) => {
    if (err) {
      debug(err);
      return;
    }

    const last = span.responses[span.responses.length - 1];

    // Convert from B to MB
    stat.memory = stat.memory / 1024 / 1024;
    stat.load = os.loadavg();
    stat.timestamp = Date.now();
    stat.heap = v8.getHeapStatistics();

    // Detailed memory breakdown
    const memUsage = process.memoryUsage();
    stat.memoryBreakdown = {
      rss: memUsage.rss / 1024 / 1024,
      heapUsed: memUsage.heapUsed / 1024 / 1024,
      heapTotal: memUsage.heapTotal / 1024 / 1024,
      external: memUsage.external / 1024 / 1024,
      arrayBuffers: memUsage.arrayBuffers / 1024 / 1024,
    };

    // System info
    stat.systemInfo = {
      cpuCount: os.cpus().length,
      uptime: process.uptime(),
      nodeVersion: process.version,
      platform: `${os.type()} ${os.release()}`,
      pid: process.pid,
    };

    if (eventLoopStats) {
      stat.loop = eventLoopStats.sense();
    }

    span.os.push(stat);
    if (!span.responses[0] || (last.timestamp + span.interval) * 1000 < Date.now()) {
      span.responses.push(defaultResponse);
    }

    // Periodic downsampling (run every ~60 ticks to avoid overhead)
    if (!span._tickCount) span._tickCount = 0;
    span._tickCount++;
    if (span._tickCount % 60 === 0) {
      downsample(span);
    }

    sendMetrics(io, span);

    // Mark store for disk flush
    if (metricsStore) {
      metricsStore.markDirty();
    }
  });
};

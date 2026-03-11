'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const debug = require('debug')('express-status-monitor');

const STORE_VERSION = 1;

class MetricsStore {
  /**
   * @param {object} options
   * @param {string} options.dataDir - Directory for the metrics file
   * @param {number} options.flushInterval - Seconds between disk flushes
   * @param {Array}  options.spans - Span configurations
   */
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(os.tmpdir(), 'express-status-monitor');
    this.flushInterval = (options.flushInterval || 30) * 1000;
    this.spans = options.spans || [];
    this.filePath = path.join(this.dataDir, 'metrics.json');
    this._dirty = false;
    this._flushTimer = null;
  }

  /**
   * Load stored metrics from disk and populate span arrays.
   * If file doesn't exist or is corrupt, starts fresh.
   */
  load() {
    try {
      if (!fs.existsSync(this.filePath)) {
        debug('No metrics file found, starting fresh');
        return;
      }

      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw);

      if (data.version !== STORE_VERSION) {
        debug('Metrics file version mismatch, starting fresh');
        return;
      }

      // Match stored spans to current config by interval
      for (const span of this.spans) {
        const stored = data.spans?.find(s => s.interval === span.interval);
        if (!stored) continue;

        // Restore os metrics — filter out stale data beyond retention window
        const cutoff = Date.now() - (span.interval * span.retention * 1000);
        span.os = (stored.os || []).filter(pt => pt.timestamp > cutoff);
        span.responses = (stored.responses || []).filter(pt => pt.timestamp > cutoff);

        debug(
          `Restored span ${span.interval}s: ${span.os.length} os points, ${span.responses.length} response points`
        );
      }
    } catch (err) {
      debug('Failed to load metrics file: %s', err.message);
    }
  }

  /**
   * Mark the store as dirty so it will be flushed on the next cycle.
   */
  markDirty() {
    this._dirty = true;
  }

  /**
   * Start the periodic flush timer.
   */
  startAutoFlush() {
    if (this._flushTimer) return;

    this._flushTimer = setInterval(() => {
      if (this._dirty) {
        this.flush();
        this._dirty = false;
      }
    }, this.flushInterval);

    // Don't prevent process exit
    this._flushTimer.unref();

    // Flush on graceful shutdown
    process.on('exit', () => this.flush());

    // Handle SIGTERM/SIGINT for clean shutdown
    const shutdown = () => {
      this.flush();
      process.exit(0);
    };
    process.once('SIGTERM', shutdown);
    process.once('SIGINT', shutdown);
  }

  /**
   * Flush current span data to disk atomically.
   * Writes to a temp file, then renames (atomic on most filesystems).
   */
  flush() {
    try {
      // Ensure data directory exists
      fs.mkdirSync(this.dataDir, { recursive: true });

      const data = {
        version: STORE_VERSION,
        updated: Date.now(),
        spans: this.spans.map(span => ({
          interval: span.interval,
          retention: span.retention,
          os: span.os || [],
          // Strip responseTimes array from stored responses (too large, not needed for history)
          responses: (span.responses || []).map(r => {
            const copy = { ...r };
            delete copy.responseTimes;
            return copy;
          }),
        })),
      };

      const json = JSON.stringify(data);
      const tmpPath = this.filePath + '.tmp';

      fs.writeFileSync(tmpPath, json, 'utf8');
      fs.renameSync(tmpPath, this.filePath);

      debug('Flushed metrics to disk (%d bytes)', json.length);
    } catch (err) {
      debug('Failed to flush metrics: %s', err.message);
    }
  }

  /**
   * Stop the auto-flush timer.
   */
  stop() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    // Final flush
    this.flush();
  }
}

module.exports = MetricsStore;

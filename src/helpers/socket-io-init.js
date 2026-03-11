/* eslint strict: "off", init-declarations: "off" */

'use strict';

const socketIo = require('socket.io');
const gatherOsMetrics = require('./gather-os-metrics');
const MetricsStore = require('./metrics-store');

let io;
let metricsStore;

const addSocketEvents = (socket, config) => {
  socket.emit('esm_start', config.spans);
  socket.on('esm_change', () => {
    socket.emit('esm_start', config.spans);
  });
};

/**
 * Initialize metric collection intervals.
 * Called once when the middleware is first mounted — starts collecting
 * immediately, regardless of whether any dashboard clients are connected.
 */
const startCollection = (config) => {
  config.spans.forEach(span => {
    if (!span.os) span.os = [];
    if (!span.responses) span.responses = [];

    const interval = setInterval(() => gatherOsMetrics(io, span, metricsStore), span.interval * 1000);

    // Don't keep Node.js process up
    interval.unref();
  });
};

module.exports = (server, config) => {
  if (io === null || io === undefined) {
    if (config.websocket !== null) {
      io = config.websocket;
    } else {
      io = socketIo(server);
    }

    // Initialize persistent store and load historical data
    metricsStore = new MetricsStore({
      dataDir: config.dataDir,
      flushInterval: config.flushInterval,
      spans: config.spans,
    });
    metricsStore.load();
    metricsStore.startAutoFlush();

    io.on('connection', socket => {
      if (config.authorize) {
        config
          .authorize(socket)
          .then(authorized => {
            if (!authorized) socket.disconnect('unauthorized');
            else addSocketEvents(socket, config);
          })
          .catch(() => socket.disconnect('unauthorized'));
      } else {
        addSocketEvents(socket, config);
      }
    });

    // Start collection immediately (not waiting for client connections)
    startCollection(config);
  }
};

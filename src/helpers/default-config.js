module.exports = {
  title: 'Express Status Monitor',
  path: '/status',
  socketPath: '/socket.io',
  spans: [
    {
      interval: 1,
      retention: 60,
    },
    {
      interval: 5,
      retention: 60,
    },
    {
      interval: 15,
      retention: 60,
    },
  ],
  port: null,
  websocket: null,
  iframe: false,
  darkMode: 'auto', // 'auto' | 'dark' | 'light'
  chartVisibility: {
    cpu: true,
    mem: true,
    load: true,
    heap: true,
    eventLoop: true,
    responseTime: true,
    rps: true,
    statusCodes: true,
  },
  ignoreStartsWith: '/admin',
  healthChecks: [],
  dataDir: null, // Directory for persistent metrics (default: os.tmpdir()/express-status-monitor)
  flushInterval: 30, // Seconds between disk flushes
};

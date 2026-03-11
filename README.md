<div align="center">
 <br />
 <h1>
  Express Status Monitor Plus
 </h1>
 <p>
  Real-time server monitoring dashboard for Express.js&nbsp;—&nbsp;zero-config, self-hosted, production-ready.
 </p>
 <br />
 <p>
  <a href="https://www.npmjs.com/package/express-status-monitor-plus"><img src="https://img.shields.io/npm/v/express-status-monitor-plus.svg?style=flat-square&color=007aff" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-status-monitor-plus"><img src="https://img.shields.io/npm/dm/express-status-monitor-plus.svg?style=flat-square&color=30d158" alt="npm downloads" /></a>
  <a href="https://github.com/manhbi18112005/express-status-monitor-plus/actions/workflows/npm-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/manhbi18112005/express-status-monitor-plus/npm-publish.yml?style=flat-square&label=CI" alt="CI status" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://discord.gg/nCQbSag"><img src="https://img.shields.io/discord/425670185089892362?style=flat-square&color=5865F2&logo=discord&logoColor=white&label=discord" alt="Discord" /></a>
 </p>
</div>

<br />

> **Note:** Starting with v2.0, this project will be operating as an independent fork of the original [express-status-monitor](https://github.com/RafalWilinski/express-status-monitor).

![Dashboard Preview](./assets/showcase.gif)

## ✨ Features

- **Real-time monitoring** — CPU, memory, heap, load average, event loop latency, response times, requests/sec, and HTTP status codes
- **Persistent storage** — Metrics survive process restarts via a file-based ring buffer (inspired by RRDtool)
- **Response time percentiles** — P50, P95, P99 tracking with reservoir sampling
- **Health checks** — Monitor upstream service availability with configurable endpoints
- **Apple-inspired UI** — Dark/light/system themes, glassmorphism header, per-metric accent colors, smooth animations
- **Chart toolbars** — Zoom in/out, reset zoom, and download chart as PNG
- **Zero CDN dependencies** — All assets bundled with Rollup (Chart.js, Socket.io client, CSS)
- **Lightweight** — Single middleware, ~200 KB bundled, minimal runtime overhead
- **Tree-shaken** — Only imports the Chart.js components actually used

## 📦 Installation

```bash
npm install express-status-monitor-plus
```

**Requirements:** Node.js ≥ 18

## 🚀 Quick Start

```javascript
const express = require('express');
const statusMonitor = require('express-status-monitor-plus');

const app = express();

// Add as the FIRST middleware, before any routes
app.use(statusMonitor());

app.get('/', (req, res) => res.send('Hello World'));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('Dashboard at http://localhost:3000/status');
});
```

Open **http://localhost:3000/status** to view the dashboard.

## ⚙️ Configuration

Pass an options object to customize behavior:

```javascript
app.use(statusMonitor({
  title: 'Express Status Monitor',   // Dashboard page title
  path: '/status',                    // Dashboard URL path
  socketPath: '/socket.io',          // Socket.io endpoint path

  // Data collection spans (interval in seconds, retention in data points)
  spans: [
    { interval: 1,  retention: 60 },  // 1 point/sec,  keep 60 points (1 min)
    { interval: 5,  retention: 60 },  // 1 point/5sec, keep 60 points (5 min)
    { interval: 15, retention: 60 },  // 1 point/15sec, keep 60 points (15 min)
  ],

  // Persistent storage
  dataDir: null,                      // Metrics directory (default: os.tmpdir()/express-status-monitor)
  flushInterval: 30,                  // Seconds between disk writes (default: 30)

  // Appearance
  darkMode: 'auto',                   // 'auto' | 'dark' | 'light'

  // Chart visibility
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

  // Networking
  port: null,                         // Custom port for Socket.io (null = use Express server)
  websocket: null,                    // Pass your own Socket.io instance
  iframe: false,                      // Allow embedding in iframes

  // Filtering
  ignoreStartsWith: '/admin',         // Ignore routes starting with this prefix

  // Health checks (see below)
  healthChecks: [],
}));
```

## 🏥 Health Checks

Add HTTP health check endpoints that are displayed at the bottom of the dashboard:

```javascript
app.use(statusMonitor({
  healthChecks: [
    {
      protocol: 'http',
      host: 'localhost',
      path: '/api/health',
      port: '3000',
    },
    {
      protocol: 'https',
      host: 'api.example.com',
      path: '/ping',
      port: '443',
    },
  ],
}));
```

Each endpoint is polled periodically. A `200` status code is considered **OK**, anything else is marked as **FAILED**.

## 💾 Persistent Metrics

By default, metrics are stored on disk so they survive process restarts. The storage engine uses a **fixed-size ring buffer** (inspired by [RRDtool](https://oss.oetiker.ch/rrdtool/)):

- **Atomic writes** — Writes to a temp file, then renames (prevents corruption on crash)
- **Bounded size** — File stays at ~50–200 KB regardless of uptime
- **Debounced I/O** — Flushes to disk every 30 seconds by default, not on every metric tick
- **Graceful shutdown** — Automatically flushes on `SIGTERM`, `SIGINT`, and `process.exit`
- **Stale data filtering** — On startup, only restores data within the retention window

```javascript
// Custom storage directory
app.use(statusMonitor({
  dataDir: '/var/data/my-app/metrics',
  flushInterval: 60,  // flush every 60 seconds
}));
```

## 🔒 Securing the Dashboard

The middleware exposes a `pageRoute` handler that can be wrapped with authentication:

### Using [connect-ensure-login](https://www.npmjs.com/package/connect-ensure-login)

```javascript
const ensureLoggedIn = require('connect-ensure-login').ensureLoggedIn();
const statusMonitor = require('express-status-monitor-plus')();

app.use(statusMonitor);
app.get('/status', ensureLoggedIn, statusMonitor.pageRoute);
```

### Using [http-auth](https://www.npmjs.com/package/http-auth)

```javascript
const auth = require('http-auth');
const basic = auth.basic({ realm: 'Monitor Area' }, (user, pass, callback) => {
  callback(user === 'admin' && pass === 'secret');
});

const statusMonitor = require('express-status-monitor-plus')({ path: '' });
app.use(statusMonitor.middleware);
app.get('/status', basic.check(statusMonitor.pageRoute));
```

## 🔌 Using with an Existing Socket.io Instance

If your project already uses Socket.io, pass your instance to avoid conflicts:

```javascript
const http = require('http');
const { Server } = require('socket.io');
const express = require('express');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(require('express-status-monitor-plus')({
  websocket: io,
  port: 3000,
}));
```

## 🛠 Development

```bash
# Install dependencies
npm install

# Build assets (Rollup: JS + CSS + HTML → dist/)
npm run build

# Start dev server with live reload
npm run dev

# Watch mode (rebuild on file changes)
npm run build:watch

# Run tests
npm test

# Lint
npm run lint
```

### Project Structure

```
├── src/
│   ├── helpers/
│   │   ├── default-config.js      # Default configuration
│   │   ├── gather-os-metrics.js   # OS/process metric collection
│   │   ├── health-checker.js      # HTTP health check runner
│   │   ├── metrics-store.js       # Persistent ring buffer storage
│   │   ├── on-headers-listener.js # Response time tracking
│   │   ├── send-metrics.js        # Socket.io metric emission
│   │   ├── socket-io-init.js      # Socket.io + collection init
│   │   └── validate.js            # Config validation
│   ├── middleware-wrapper.js       # Express middleware
│   └── public/
│       ├── index.html             # Dashboard HTML (Handlebars template)
│       ├── javascripts/app.js     # Client-side app (ES modules)
│       └── stylesheets/styles.css # Dashboard styles
├── dist/                          # Build output (gitignored)
├── rollup.config.mjs             # Rollup build configuration
└── test/                          # Mocha test suite
```

## 📄 License

[MIT](https://opensource.org/licenses/MIT) © [MyT](https://github.com/manhbi18112005)

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/manhbi18112005">MyT</a> · Originally forked from <a href="https://github.com/RafalWilinski/express-status-monitor">express-status-monitor</a></sub>
</div>

<div align="center">
<h1>🚀 Express Status Monitor Plus</h1>
<p>
<b>Real-time, zero-config, self-hosted APM dashboard for Node.js & Express.js</b>
</p>
<br />
<p>
  <a href="https://www.npmjs.com/package/express-status-monitor-plus"><img src="https://img.shields.io/npm/v/express-status-monitor-plus.svg?style=flat-square&color=007aff" alt="npm version" /></a>
  <a href="https://www.npmjs.com/package/express-status-monitor-plus"><img src="https://img.shields.io/npm/dm/express-status-monitor-plus.svg?style=flat-square&color=30d158" alt="npm downloads" /></a>
  <a href="https://github.com/No-Name-Studio-VN/express-status-monitor-plus/actions/workflows/npm-publish.yml"><img src="https://img.shields.io/github/actions/workflow/status/No-Name-Studio-VN/express-status-monitor-plus/npm-publish.yml?style=flat-square&label=CI" alt="CI status" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License" /></a>
  <a href="https://discord.gg/nCQbSag"><img src="https://img.shields.io/discord/425670185089892362?style=flat-square&color=5865F2&logo=discord&logoColor=white&label=discord" alt="Discord" /></a>
 </p>
</div>

![Dashboard Preview](./assets/showcase.gif)

**Express Status Monitor Plus** is a lightweight, production-ready Application Performance Monitoring (APM) tool. It provides a beautiful, modern dashboard to track your server's health in real-time.

As an independent, heavily upgraded fork of the original `express-status-monitor`, this **Plus** version introduces critical enterprise features like persistent metrics across restarts, P50/P95/P99 percentiles, dark mode, and upstream health checks—all without the steep cost of commercial APMs like Datadog or New Relic.

## ✨ Why choose "Plus"? (Key Features)

* 💾 **Persistent Storage:** Metrics survive process restarts and deployments via a highly optimized, file-based ring buffer.
* 📊 **Advanced Percentiles:** Built-in reservoir sampling for P50, P95, and P99 response time tracking to catch edge-case latency.
* 🏥 **Service Health Checks:** Monitor the uptime of your upstream services and third-party APIs directly from the dashboard.
* 🎨 **Modernized UI:** Glassmorphism headers, dark/light/system themes, interactive charts with smooth animations.
* ⚡ **Ultra-Lightweight:** Just one single middleware and a ~200 KB bundled frontend. Zero massive dependencies.
* 📈 **Comprehensive Metrics:** Tracks CPU, memory, heap, load average, event loop latency, response times, requests/sec, and HTTP status codes.

---

## 📦 Installation

```bash
npm install express-status-monitor-plus

```

*Requires Node.js ≥ 18*

## 🚀 Quick Start

Add the monitor as the **very first middleware** in your Express application, before any other routes or middleware.

```javascript
const express = require('express');
const statusMonitor = require('express-status-monitor-plus');

const app = express();

// Initialize the dashboard and data collection
app.use(statusMonitor());

app.get('/', (req, res) => res.send('Hello World'));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
  console.log('Dashboard available at http://localhost:3000/status');
});

```

Navigate to **[`http://localhost:3000/status`](https://www.google.com/search?q=http://localhost:3000/status)** to view your live metrics!

---

## ⚙️ Advanced Configuration

Pass a configuration object to tailor the dashboard exactly to your infrastructure needs.

```javascript
app.use(statusMonitor({
  title: 'Express Status Monitor Plus',       // Dashboard page title
  path: '/status',                   // Dashboard URL path
  socketPath: '/socket.io',          // Socket.io endpoint path
  darkMode: 'auto',                  // 'auto' | 'dark' | 'light'
  
  // Storage & Persistence
  dataDir: '/var/data/my-app/metrics', // Custom metrics directory
  flushInterval: 30,                   // Seconds between disk writes
  
  // Data retention rules (interval in seconds, retention in data points)
  spans: { interval: 5,  retention: 60 },  // 1 point/5sec, keep for 5 min

  // Exclude specific routes from tracking
  ignoreStartsWith: '/admin',

  // Toggle specific charts
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
}));

```

## 🏥 Upstream Health Checks

Keep an eye on the databases, microservices, or external APIs your Express app relies on. Endpoints returning a `200 OK` are marked as healthy, while timeouts or other status codes trigger a failure alert on your dashboard.

```javascript
app.use(statusMonitor({
  healthChecks: [
    {
      protocol: 'http',
      host: 'localhost',
      path: '/api/internal/health',
      port: '3000',
    },
    {
      protocol: 'https',
      host: 'api.stripe.com',
      path: '/v1/ping',
      port: '443',
    },
  ],
}));

```

## 🔒 Securing the Dashboard in Production

You should absolutely protect your `/status` route in production. The middleware exposes a `pageRoute` handler that easily wraps around your existing authentication strategies.

**Example using `http-auth` (Basic Auth):**

```javascript
const auth = require('http-auth');
const basic = auth.basic({ realm: 'Monitor Area' }, (user, pass, callback) => {
  callback(user === 'admin' && pass === 'supersecret');
});

const statusMonitor = require('express-status-monitor-plus')({ path: '' });

app.use(statusMonitor.middleware);
app.get('/status', basic.check(statusMonitor.pageRoute));
```

## 🔌 Custom Socket.io Instances

If your application already leverages WebSockets, pass your existing Socket.io instance to prevent port conflicts and reuse your existing upgrade handlers.

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

## 📄 License

[MIT](https://opensource.org/licenses/MIT)

---

<div align="center">
  <sub>Built with ❤️ by <a href="https://github.com/No-Name-Studio-VN">No Name Studio</a> · Originally forked from <a href="https://github.com/RafalWilinski/express-status-monitor">express-status-monitor</a></sub>
</div>

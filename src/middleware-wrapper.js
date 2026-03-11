const fs = require('fs');
const path = require('path');
const onHeaders = require('on-headers');
const Handlebars = require('handlebars');
const validate = require('./helpers/validate');
const onHeadersListener = require('./helpers/on-headers-listener');
const socketIoInit = require('./helpers/socket-io-init');
const healthChecker = require('./helpers/health-checker');

const middlewareWrapper = config => {
  const validatedConfig = validate(config);
  const bodyClasses = Object.keys(validatedConfig.chartVisibility)
    .reduce((accumulator, key) => {
      if (validatedConfig.chartVisibility[key] === false) {
        accumulator.push(`hide-${key}`);
      }
      return accumulator;
    }, [])
    .join(' ');

  // Read bundled assets — prefer dist/ (production), fallback to src/ (dev)
  const distDir = path.join(__dirname, '..', 'dist');
  const srcDir = path.join(__dirname, 'public');

  const getStyleSheet = () => {
    try {
      return fs.readFileSync(path.join(distDir, 'styles.min.css'), 'utf8');
    } catch {
      return fs.readFileSync(path.join(srcDir, 'stylesheets/styles.css'), 'utf8');
    }
  };

  const getScript = () => {
    try {
      return fs.readFileSync(path.join(distDir, 'app.min.js'), 'utf8');
    } catch {
      return fs.readFileSync(path.join(srcDir, 'javascripts/app.js'), 'utf8');
    }
  };

  const getTemplate = () => {
    try {
      return fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');
    } catch {
      return fs.readFileSync(path.join(srcDir, 'index.html'), 'utf8');
    }
  };

  // Register Handlebars helper for health check rendering
  Handlebars.registerHelper('healthCheckList', function (checks) {
    if (!checks || checks.length === 0) return '';
    return new Handlebars.SafeString(
      checks.map(check => `
        <div class="health-check-item">
          <span class="health-check-path">${Handlebars.escapeExpression(check.path)}</span>
          <span class="health-check-badge health-check-${Handlebars.escapeExpression(check.bg)}">${Handlebars.escapeExpression(check.status)}${check.responseTime ? ' (' + check.responseTime + 'ms)' : ''}</span>
        </div>
      `).join('')
    );
  });

  const data = {
    title: validatedConfig.title,
    port: validatedConfig.port,
    socketPath: validatedConfig.socketPath,
    bodyClasses,
    darkMode: validatedConfig.darkMode,
    script: getScript(),
    style: getStyleSheet(),
  };

  const htmlTmpl = getTemplate();

  const render = Handlebars.compile(htmlTmpl);

  const middleware = (req, res, next) => {
    socketIoInit(req.socket.server, validatedConfig);

    const startTime = process.hrtime();

    if (req.path === validatedConfig.path) {
      healthChecker(validatedConfig.healthChecks).then(results => {
        data.healthCheckResults = results;
        if (validatedConfig.iframe) {
          if (res.removeHeader) {
            res.removeHeader('X-Frame-Options');
          }

          if (res.remove) {
            res.remove('X-Frame-Options');
          }
        }

        res.send(render(data));
      });
    } else {
      if (!req.path.startsWith(validatedConfig.ignoreStartsWith)) {
        onHeaders(res, () => {
          onHeadersListener(res.statusCode, startTime, validatedConfig.spans);
        });
      }

      next();
    }
  };

  /* Provide two properties, the middleware and HTML page renderer separately
   * so that the HTML page can be authenticated while the middleware can be
   * earlier in the request handling chain.  Use like:
   * ```
   * const statusMonitor = require('express-status-monitor')(config);
   * server.use(statusMonitor);
   * server.get('/status', isAuthenticated, statusMonitor.pageRoute);
   * ```
   * discussion: https://github.com/RafalWilinski/express-status-monitor/issues/63
   */
  middleware.middleware = middleware;
  middleware.pageRoute = (req, res) => {
    healthChecker(validatedConfig.healthChecks).then(results => {
      data.healthCheckResults = results;
      res.send(render(data));
    });
  };
  return middleware;
};

module.exports = middlewareWrapper;

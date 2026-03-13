const defaultConfig = require('./default-config');
const debug = require('debug')('express-status-monitor');

module.exports = config => {
  if (!config) {
    return defaultConfig;
  }

  const mungeChartVisibility = configChartVisibility => {
    Object.keys(defaultConfig.chartVisibility).forEach(key => {
      if (configChartVisibility[key] === false) {
        defaultConfig.chartVisibility[key] = false;
      }
    });
    return defaultConfig.chartVisibility;
  };

  config.title =
    typeof config.title === 'string' ? config.title : defaultConfig.title;
  config.path =
    typeof config.path === 'string' ? config.path : defaultConfig.path;
  config.socketPath =
    typeof config.socketPath === 'string' ? config.socketPath : defaultConfig.socketPath;

  // Single span validation (backward-compat: migrate spans[] → span)
  if (config.spans && Array.isArray(config.spans) && !config.span) {
    debug('DEPRECATED: config.spans is deprecated, use config.span = { interval } instead');
    config.span = { interval: config.spans[0]?.interval || defaultConfig.span.interval };
  }
  if (typeof config.span === 'object' && config.span !== null) {
    config.span = {
      interval: typeof config.span.interval === 'number' && config.span.interval > 0
        ? config.span.interval
        : defaultConfig.span.interval,
    };
  } else {
    config.span = { ...defaultConfig.span };
  }
  delete config.spans;

  config.port =
    typeof config.port === 'number' ? config.port : defaultConfig.port;
  config.websocket =
    typeof config.websocket === 'object'
      ? config.websocket
      : defaultConfig.websocket;
  config.iframe =
    typeof config.iframe === 'boolean' ? config.iframe : defaultConfig.iframe;
  config.darkMode =
    typeof config.darkMode === 'string' && ['auto', 'dark', 'light'].includes(config.darkMode)
      ? config.darkMode
      : defaultConfig.darkMode;
  config.chartVisibility =
    typeof config.chartVisibility === 'object'
      ? mungeChartVisibility(config.chartVisibility)
      : defaultConfig.chartVisibility;
  config.ignoreStartsWith =
    typeof config.path === 'string'
      ? config.ignoreStartsWith
      : defaultConfig.ignoreStartsWith;

  config.healthChecks =
    Array.isArray(config.healthChecks)
      ? config.healthChecks
      : defaultConfig.healthChecks;

  config.dataDir =
    typeof config.dataDir === 'string'
      ? config.dataDir
      : defaultConfig.dataDir;

  config.flushInterval =
    typeof config.flushInterval === 'number' && config.flushInterval > 0
      ? config.flushInterval
      : defaultConfig.flushInterval;

  return config;
};

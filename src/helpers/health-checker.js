'use strict';

module.exports = async healthChecks => {
  const checks = healthChecks || [];
  if (checks.length === 0) return [];

  const checkPromises = checks.map(async (healthCheck, index) => {
    let uri = `${healthCheck.protocol}://${healthCheck.host}`;

    if (healthCheck.port) {
      uri += `:${healthCheck.port}`;
    }

    uri += healthCheck.path;

    const start = Date.now();
    try {
      const response = await fetch(uri, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      return {
        path: healthCheck.path,
        status: response.ok ? 'ok' : 'failed',
        statusCode: response.status,
        responseTime: Date.now() - start,
        bg: response.ok ? 'success' : 'danger',
      };
    } catch {
      return {
        path: healthCheck.path,
        status: 'failed',
        statusCode: 0,
        responseTime: Date.now() - start,
        bg: 'danger',
      };
    }
  });

  return Promise.allSettled(checkPromises).then(results =>
    results.map(r => r.status === 'fulfilled' ? r.value : {
      path: 'unknown',
      status: 'failed',
      statusCode: 0,
      responseTime: 0,
      bg: 'danger',
    })
  );
};

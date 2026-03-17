#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8080';

const DEFAULT_COORDINATES = {
  origin: {
    lat: 44.4268,
    lon: 26.1025,
  },
  startOverride: {
    lat: 44.4315,
    lon: 26.0872,
  },
  destination: {
    lat: 44.4378,
    lon: 26.0946,
  },
};

const OPERATION_LABELS = {
  health: 'GET /health',
  coverage: 'GET /v1/coverage',
  preview: 'POST /v1/routes/preview',
  reroute: 'POST /v1/routes/reroute',
  search: 'POST /v1/search/autocomplete',
};

const PROFILE_CONFIG = {
  smoke: {
    mode: 'iterations',
    iterations: 12,
    concurrency: 2,
    mix: {
      health: 2,
      coverage: 2,
      preview: 3,
      reroute: 2,
      search: 3,
    },
    thresholds: {
      maxErrorRate: 0.05,
      overallP95Ms: 3000,
      previewP95Ms: 2500,
      rerouteP95Ms: 2000,
      searchP95Ms: 1200,
      healthP95Ms: 500,
    },
  },
  steady: {
    mode: 'duration',
    durationMs: 60000,
    concurrency: 6,
    mix: {
      health: 5,
      coverage: 5,
      preview: 45,
      reroute: 20,
      search: 25,
    },
    thresholds: {
      maxErrorRate: 0.02,
      overallP95Ms: 2500,
      previewP95Ms: 2500,
      rerouteP95Ms: 2000,
      searchP95Ms: 1200,
      healthP95Ms: 500,
    },
  },
  burst: {
    mode: 'duration',
    durationMs: 30000,
    concurrency: 14,
    mix: {
      health: 5,
      coverage: 5,
      preview: 50,
      reroute: 20,
      search: 20,
    },
    thresholds: {
      maxErrorRate: 0.05,
      overallP95Ms: 3000,
      previewP95Ms: 3000,
      rerouteP95Ms: 2500,
      searchP95Ms: 1500,
      healthP95Ms: 700,
    },
  },
};

const formatDuration = (milliseconds) => {
  if (milliseconds >= 60000) {
    return `${(milliseconds / 60000).toFixed(1)} min`;
  }

  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toFixed(1)} s`;
  }

  return `${Math.round(milliseconds)} ms`;
};

const percentile = (values, fraction) => {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1),
  );

  return Math.round(sorted[index]);
};

const average = (values) => {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
};

const sum = (values) => values.reduce((total, value) => total + value, 0);

const parseArgs = (argv) => {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];

    if (!current.startsWith('--')) {
      continue;
    }

    const key = current.slice(2);
    const next = argv[index + 1];

    if (!next || next.startsWith('--')) {
      parsed[key] = 'true';
      continue;
    }

    parsed[key] = next;
    index += 1;
  }

  return parsed;
};

const parseIntegerArg = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const buildTimestamp = () => new Date().toISOString().replace(/[:.]/g, '-');

const buildRequestBodies = () => {
  const shared = {
    origin: DEFAULT_COORDINATES.origin,
    startOverride: DEFAULT_COORDINATES.startOverride,
    destination: DEFAULT_COORDINATES.destination,
    mode: 'safe',
    avoidUnpaved: false,
    locale: 'en',
    countryHint: 'RO',
  };

  return {
    health: {
      method: 'GET',
      path: '/health',
    },
    coverage: {
      method: 'GET',
      path: `/v1/coverage?lat=${DEFAULT_COORDINATES.origin.lat}&lon=${DEFAULT_COORDINATES.origin.lon}`,
    },
    preview: {
      method: 'POST',
      path: '/v1/routes/preview',
      body: shared,
    },
    reroute: {
      method: 'POST',
      path: '/v1/routes/reroute',
      body: shared,
    },
    search: {
      method: 'POST',
      path: '/v1/search/autocomplete',
      body: {
        query: 'Piata Victoriei',
        countryHint: 'RO',
        locale: 'en',
      },
    },
  };
};

const buildWeightedOperations = (mix) =>
  Object.entries(mix).flatMap(([operation, weight]) =>
    Array.from({ length: weight }, () => operation),
  );

const pickOperation = (weightedOperations) =>
  weightedOperations[Math.floor(Math.random() * weightedOperations.length)];

const createHeaders = (authToken) => {
  const headers = {
    accept: 'application/json',
  };

  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  return headers;
};

const executeOperation = async ({
  baseUrl,
  authToken,
  requestBodies,
  operation,
}) => {
  const operationConfig = requestBodies[operation];
  const headers = createHeaders(authToken);

  if (operationConfig.body) {
    headers['content-type'] = 'application/json';
  }

  const startedAt = performance.now();

  try {
    const response = await fetch(`${baseUrl}${operationConfig.path}`, {
      method: operationConfig.method,
      headers,
      body: operationConfig.body ? JSON.stringify(operationConfig.body) : undefined,
    });

    await response.text();

    return {
      operation,
      ok: response.ok,
      status: response.status,
      latencyMs: Math.round(performance.now() - startedAt),
      cacheStatus:
        operation === 'preview' || operation === 'reroute'
          ? response.headers.get('x-route-cache')
          : null,
      error: null,
    };
  } catch (error) {
    return {
      operation,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - startedAt),
      cacheStatus: null,
      error: error instanceof Error ? error.message : 'Network request failed.',
    };
  }
};

const evaluateThresholds = ({ report, profileConfig, allowRateLimit }) => {
  const failures = [];
  const errorRate = report.summary.errorRate;

  if (errorRate > profileConfig.thresholds.maxErrorRate) {
    failures.push(
      `error rate ${errorRate.toFixed(3)} exceeded max ${profileConfig.thresholds.maxErrorRate.toFixed(3)}`,
    );
  }

  if (
    report.summary.latency.overall.p95 !== null &&
    report.summary.latency.overall.p95 > profileConfig.thresholds.overallP95Ms
  ) {
    failures.push(
      `overall p95 ${report.summary.latency.overall.p95} ms exceeded ${profileConfig.thresholds.overallP95Ms} ms`,
    );
  }

  for (const operation of ['preview', 'reroute', 'search', 'health']) {
    const operationLatency = report.operations[operation]?.latency?.p95 ?? null;
    const thresholdKey = `${operation}P95Ms`;
    const thresholdValue = profileConfig.thresholds[thresholdKey];

    if (operationLatency !== null && thresholdValue !== undefined && operationLatency > thresholdValue) {
      failures.push(`${operation} p95 ${operationLatency} ms exceeded ${thresholdValue} ms`);
    }
  }

  if (!allowRateLimit && report.summary.statusCounts['429']) {
    failures.push(`encountered ${report.summary.statusCounts['429']} rate-limited responses`);
  }

  return failures;
};

const printSummary = (report) => {
  console.log('');
  console.log(`Load test complete: ${report.profile}`);
  console.log(`Base URL: ${report.baseUrl}`);
  console.log(`Run mode: ${report.run.mode}`);
  console.log(`Elapsed: ${formatDuration(report.run.elapsedMs)}`);
  console.log(`Concurrency: ${report.run.concurrency}`);
  console.log(`Total requests: ${report.summary.totalRequests}`);
  console.log(`Successes: ${report.summary.successfulRequests}`);
  console.log(`Failures: ${report.summary.failedRequests}`);
  console.log(`Error rate: ${(report.summary.errorRate * 100).toFixed(2)}%`);
  console.log(
    `Overall latency: avg ${report.summary.latency.overall.average ?? 'n/a'} ms, p95 ${
      report.summary.latency.overall.p95 ?? 'n/a'
    } ms, p99 ${report.summary.latency.overall.p99 ?? 'n/a'} ms`,
  );
  console.log('Status counts:', report.summary.statusCounts);
  console.log('Per-operation summary:');

  for (const [operation, operationSummary] of Object.entries(report.operations)) {
    if (operationSummary.count === 0) {
      continue;
    }

    console.log(
      `  - ${OPERATION_LABELS[operation]} :: count ${operationSummary.count}, errors ${operationSummary.errors}, avg ${operationSummary.latency.average ?? 'n/a'} ms, p95 ${operationSummary.latency.p95 ?? 'n/a'} ms`,
    );

    if (operationSummary.cache) {
      console.log(
        `    cache hits ${operationSummary.cache.hits}, misses ${operationSummary.cache.misses}`,
      );
    }
  }

  console.log(`Report: ${report.reportPath}`);
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  const profileName = args.profile ?? 'smoke';
  const profileConfig = PROFILE_CONFIG[profileName];

  if (!profileConfig) {
    console.error(
      `Unknown profile "${profileName}". Supported profiles: ${Object.keys(PROFILE_CONFIG).join(', ')}`,
    );
    process.exit(1);
  }

  const baseUrl = (args['base-url'] ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const authToken = args['auth-token'] ?? '';
  const concurrency = parseIntegerArg(args.concurrency, profileConfig.concurrency);
  const durationMs = parseIntegerArg(args['duration-ms'], profileConfig.durationMs ?? 0);
  const iterations = parseIntegerArg(args.iterations, profileConfig.iterations ?? 0);
  const allowRateLimit = args['allow-rate-limit'] === 'true';
  const weightedOperations = buildWeightedOperations(profileConfig.mix);
  const requestBodies = buildRequestBodies();

  const outputDirectory = path.join(process.cwd(), 'output', 'load-tests');
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = path.join(
    outputDirectory,
    `mobile-api-${profileName}-${buildTimestamp()}.json`,
  );

  const startedAt = performance.now();
  let issuedRequests = 0;
  const results = [];
  const stopAt = profileConfig.mode === 'duration' ? startedAt + durationMs : null;

  const shouldContinue = () => {
    if (profileConfig.mode === 'iterations') {
      return issuedRequests < iterations;
    }

    return performance.now() < stopAt;
  };

  const workers = Array.from({ length: concurrency }, async () => {
    while (shouldContinue()) {
      if (profileConfig.mode === 'iterations') {
        issuedRequests += 1;

        if (issuedRequests > iterations) {
          break;
        }
      }

      const operation = pickOperation(weightedOperations);
      const result = await executeOperation({
        baseUrl,
        authToken,
        requestBodies,
        operation,
      });

      results.push(result);
    }
  });

  await Promise.all(workers);

  const elapsedMs = Math.round(performance.now() - startedAt);
  const allLatencies = results.map((result) => result.latencyMs);
  const statusCounts = results.reduce((counts, result) => {
    const key = String(result.status);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const operations = Object.keys(OPERATION_LABELS).reduce((summary, operation) => {
    const operationResults = results.filter((result) => result.operation === operation);
    const latencies = operationResults.map((result) => result.latencyMs);
    const cacheHits = operationResults.filter((result) => result.cacheStatus === 'HIT').length;
    const cacheMisses = operationResults.filter((result) => result.cacheStatus === 'MISS').length;

    summary[operation] = {
      label: OPERATION_LABELS[operation],
      count: operationResults.length,
      errors: operationResults.filter((result) => !result.ok).length,
      latency: {
        average: average(latencies),
        p50: percentile(latencies, 0.5),
        p95: percentile(latencies, 0.95),
        p99: percentile(latencies, 0.99),
        max: latencies.length > 0 ? Math.max(...latencies) : null,
      },
      cache:
        operation === 'preview' || operation === 'reroute'
          ? {
              hits: cacheHits,
              misses: cacheMisses,
            }
          : null,
      lastErrors: operationResults
        .filter((result) => result.error)
        .slice(-5)
        .map((result) => result.error),
    };

    return summary;
  }, {});

  const successfulRequests = results.filter((result) => result.ok).length;
  const failedRequests = results.length - successfulRequests;
  const report = {
    generatedAt: new Date().toISOString(),
    profile: profileName,
    baseUrl,
    reportPath,
    run: {
      mode: profileConfig.mode,
      concurrency,
      elapsedMs,
      configuredDurationMs: profileConfig.mode === 'duration' ? durationMs : null,
      configuredIterations: profileConfig.mode === 'iterations' ? iterations : null,
      requestsPerSecond:
        elapsedMs > 0 ? Number((results.length / (elapsedMs / 1000)).toFixed(2)) : 0,
    },
    summary: {
      totalRequests: results.length,
      successfulRequests,
      failedRequests,
      errorRate: results.length > 0 ? failedRequests / results.length : 0,
      statusCounts,
      latency: {
        overall: {
          average: average(allLatencies),
          p50: percentile(allLatencies, 0.5),
          p95: percentile(allLatencies, 0.95),
          p99: percentile(allLatencies, 0.99),
          max: allLatencies.length > 0 ? Math.max(...allLatencies) : null,
        },
      },
    },
    operations,
    thresholds: profileConfig.thresholds,
  };

  const thresholdFailures = evaluateThresholds({
    report,
    profileConfig,
    allowRateLimit,
  });

  report.thresholdFailures = thresholdFailures;

  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  printSummary(report);

  if (thresholdFailures.length > 0) {
    console.error('');
    console.error('Threshold failures:');
    for (const failure of thresholdFailures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
};

await main();

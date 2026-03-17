const trackedOperationByPath: Record<string, string> = {
  '/v1/search/autocomplete': 'search_autocomplete',
  '/v1/search/reverse-geocode': 'search_reverse_geocode',
  '/v1/routes/preview': 'route_preview',
  '/v1/routes/reroute': 'route_reroute',
  '/v1/trips/start': 'trip_start',
  '/v1/trips/end': 'trip_end',
  '/v1/hazards': 'hazard_report',
  '/v1/feedback': 'navigation_feedback',
};

const normalizePath = (url: string) => url.split('?')[0] ?? url;

const getOutcome = (statusCode: number) => {
  if (statusCode >= 500) {
    return 'server_error';
  }

  if (statusCode >= 400) {
    return 'client_error';
  }

  return 'success';
};

export const buildRequestTelemetry = (
  url: string,
  statusCode: number,
  durationMs: number,
) => {
  const path = normalizePath(url);
  const operation = trackedOperationByPath[path];

  if (!operation) {
    return null;
  }

  return {
    event: 'mobile_api_request',
    operation,
    path,
    statusCode,
    durationMs: Math.round(durationMs),
    outcome: getOutcome(statusCode),
  };
};

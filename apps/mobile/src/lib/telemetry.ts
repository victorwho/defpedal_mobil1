import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

import { mobileEnv } from './env';

type TelemetryValue = string | number | boolean | null | undefined;
type TelemetryProperties = Record<
  string,
  TelemetryValue | Array<string | number | boolean>
>;

let telemetryInitialized = false;
let posthogClient: PostHog | null = null;

const sanitizeProperties = (
  properties?: TelemetryProperties,
): Record<string, string | number | boolean | null | Array<string | number | boolean>> => {
  if (!properties) {
    return {};
  }

  return Object.entries(properties).reduce<
    Record<string, string | number | boolean | null | Array<string | number | boolean>>
  >((accumulator, [key, value]) => {
    if (value === undefined) {
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
};

const sentryEnabled = Boolean(mobileEnv.sentryDsn);
const posthogEnabled = Boolean(mobileEnv.posthogApiKey);

const createPostHogClient = () => {
  if (!posthogEnabled || posthogClient) {
    return posthogClient;
  }

  posthogClient = new PostHog(mobileEnv.posthogApiKey, {
    host: mobileEnv.posthogHost,
    disabled: !posthogEnabled,
  });

  return posthogClient;
};

export const telemetryStatus = {
  sentryEnabled,
  posthogEnabled,
} as const;

export const initializeTelemetry = () => {
  if (telemetryInitialized) {
    return;
  }

  if (sentryEnabled) {
    Sentry.init({
      dsn: mobileEnv.sentryDsn,
      environment: mobileEnv.sentryEnvironment,
      enabled: true,
      tracesSampleRate: Number.isFinite(mobileEnv.sentryTracesSampleRate)
        ? mobileEnv.sentryTracesSampleRate
        : 0.2,
      sendDefaultPii: false,
      initialScope: {
        tags: {
          app_env: mobileEnv.appEnv,
          app_variant: mobileEnv.appVariant,
        },
      },
    });
  }

  createPostHogClient();
  telemetryInitialized = true;
};

export const telemetry = {
  identify: (
    user: {
      id: string;
      email?: string | null;
    } | null,
  ) => {
    initializeTelemetry();

    if (!user) {
      Sentry.setUser(null);
      posthogClient?.reset();
      return;
    }

    Sentry.setUser({
      id: user.id,
      email: user.email ?? undefined,
    });

    posthogClient?.identify(
      user.id,
      sanitizeProperties({
        email: user.email ?? null,
        app_env: mobileEnv.appEnv,
        app_variant: mobileEnv.appVariant,
      }),
    );
  },
  screen: (name: string, properties?: TelemetryProperties) => {
    initializeTelemetry();
    const nextProperties = sanitizeProperties(properties);

    if (sentryEnabled) {
      Sentry.addBreadcrumb({
        type: 'navigation',
        category: 'screen',
        level: 'info',
        message: name,
        data: nextProperties,
      });
    }

    posthogClient?.screen(name, nextProperties);
  },
  capture: (event: string, properties?: TelemetryProperties) => {
    initializeTelemetry();
    const nextProperties = sanitizeProperties(properties);

    if (sentryEnabled) {
      Sentry.addBreadcrumb({
        type: 'default',
        category: 'product',
        level: 'info',
        message: event,
        data: nextProperties,
      });
    }

    posthogClient?.capture(event, nextProperties);
  },
  captureError: (error: unknown, context?: TelemetryProperties) => {
    initializeTelemetry();
    const nextError =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');
    const nextContext = sanitizeProperties(context);

    if (sentryEnabled) {
      Sentry.withScope((scope) => {
        scope.setContext('telemetry', nextContext);
        scope.setTag('app_env', mobileEnv.appEnv);
        scope.setTag('app_variant', mobileEnv.appVariant);
        Sentry.captureException(nextError);
      });
    }

    posthogClient?.capture('mobile_error', {
      message: nextError.message,
      ...nextContext,
    });
  },
  flush: async () => {
    await Promise.allSettled([
      sentryEnabled ? Sentry.flush() : Promise.resolve(true),
      posthogClient ? posthogClient.flush() : Promise.resolve(undefined),
    ]);
  },
};

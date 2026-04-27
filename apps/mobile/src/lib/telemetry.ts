import * as Sentry from '@sentry/react-native';
import PostHog from 'posthog-react-native';

import { mobileEnv } from './env';

type TelemetryValue = string | number | boolean | null | undefined;
type TelemetryProperties = Record<
  string,
  TelemetryValue | Array<string | number | boolean>
>;

// Module-level state for the two clients. Both start `false` and only flip
// when the consent provider calls enableSentry/enablePostHog. Disable calls
// tear them back down. The telemetry helpers (capture, screen, identify,
// captureError) are no-ops when their corresponding client isn't enabled.
//
// This is the runtime gate that backs item 8 of the compliance plan: no
// telemetry events can fire before the user has explicitly consented.
let sentryEnabled = false;
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

/** Whether the Sentry DSN is configured at build time (not whether consent was granted). */
export const sentryConfigured = Boolean(mobileEnv.sentryDsn);
/** Whether the PostHog API key is configured at build time. */
export const posthogConfigured = Boolean(mobileEnv.posthogApiKey);

export const telemetryStatus = {
  /** @deprecated Use sentryConfigured + the consent flag in appStore. */
  sentryEnabled: sentryConfigured,
  /** @deprecated Use posthogConfigured + the consent flag in appStore. */
  posthogEnabled: posthogConfigured,
} as const;

export const enableSentry = () => {
  if (sentryEnabled || !sentryConfigured) {
    return;
  }

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
  sentryEnabled = true;
};

export const disableSentry = () => {
  if (!sentryEnabled) {
    return;
  }
  // Sentry.close() flushes pending events then prevents further capture.
  // We don't await — fire-and-forget, the user just wants events to stop.
  void Sentry.close();
  sentryEnabled = false;
};

export const enablePostHog = () => {
  if (posthogClient || !posthogConfigured) {
    return;
  }

  posthogClient = new PostHog(mobileEnv.posthogApiKey, {
    host: mobileEnv.posthogHost,
    disabled: false,
  });
};

export const disablePostHog = () => {
  if (!posthogClient) {
    return;
  }
  // reset() clears the in-memory user identity and pending queue, then we
  // drop the reference. Future capture/identify/screen calls become no-ops
  // because posthogClient is null.
  posthogClient.reset();
  posthogClient = null;
};

export const isSentryEnabled = () => sentryEnabled;
export const isPostHogEnabled = () => posthogClient !== null;

export const telemetry = {
  identify: (
    user: {
      id: string;
      email?: string | null;
    } | null,
  ) => {
    if (!user) {
      if (sentryEnabled) Sentry.setUser(null);
      posthogClient?.reset();
      return;
    }

    if (sentryEnabled) {
      Sentry.setUser({
        id: user.id,
        // Anonymous users have no email — Sentry receives id only.
        ...(user.email ? { email: user.email } : {}),
      });
    }

    if (posthogClient) {
      posthogClient.identify(
        user.id,
        sanitizeProperties({
          // Anonymous users have no email — PostHog receives id-only profile.
          email: user.email ?? null,
          app_env: mobileEnv.appEnv,
          app_variant: mobileEnv.appVariant,
        }),
      );
    }
  },
  screen: (name: string, properties?: TelemetryProperties) => {
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

/**
 * Apply the user's consent decision. Idempotent — calling repeatedly with the
 * same flags is a no-op, calling with new flags initializes/tears-down the
 * affected client. Designed to be invoked from a useEffect that subscribes to
 * the appStore.analyticsConsent slice.
 */
export const applyTelemetryConsent = (consent: { sentry: boolean; posthog: boolean }) => {
  if (consent.sentry) {
    enableSentry();
  } else {
    disableSentry();
  }

  if (consent.posthog) {
    enablePostHog();
  } else {
    disablePostHog();
  }
};

/**
 * @deprecated Kept temporarily for callers that still reach for explicit init.
 * The TelemetryProvider now drives lifecycle via applyTelemetryConsent. New code
 * should not call this — events fired before consent silently no-op anyway.
 */
export const initializeTelemetry = () => {
  // Intentional no-op. Telemetry is gated by user consent now.
};

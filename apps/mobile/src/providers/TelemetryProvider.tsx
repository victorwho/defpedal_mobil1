import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';

import { initializeTelemetry, telemetry } from '../lib/telemetry';
import { useAuthSession } from './AuthSessionProvider';

export const TelemetryProvider = ({ children }: PropsWithChildren) => {
  const { user } = useAuthSession();

  useEffect(() => {
    initializeTelemetry();
  }, []);

  useEffect(() => {
    telemetry.identify(
      user
        ? {
            id: user.id,
            email: user.email ?? null,
          }
        : null,
    );
  }, [user?.email, user?.id]);

  return <>{children}</>;
};

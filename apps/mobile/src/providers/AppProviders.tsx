import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../design-system';
import { AuthSessionProvider } from './AuthSessionProvider';
import { ConnectivityProvider } from './ConnectivityMonitor';
import { NavigationLifecycleManager } from './NavigationLifecycleManager';
import { DailyWeatherScheduler } from './DailyWeatherScheduler';
import { NotificationProvider } from './NotificationProvider';
import { OfflineMutationSyncManager } from './OfflineMutationSyncManager';
import { OffScreenCaptureHostProvider } from './OffScreenCaptureHost';
import { ShareClaimProcessor } from './ShareClaimProcessor';
import { ShareFallbackBootstrap } from './ShareFallbackBootstrap';
import { TelemetryProvider } from './TelemetryProvider';

const queryClient = new QueryClient();

export const AppProviders = ({ children }: PropsWithChildren) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <AuthSessionProvider>
        <TelemetryProvider>
          <ConnectivityProvider>
            <QueryClientProvider client={queryClient}>
              <NavigationLifecycleManager />
              <OfflineMutationSyncManager />
              <NotificationProvider />
              <DailyWeatherScheduler />
              {/*
                ShareClaimProcessor mounted above OffScreenCaptureHostProvider
                (which wraps `children`) so it sits at a stable layer in the
                provider tree and its Toast renders over everything else.
                It uses `useAuthSessionOptional` internally, so it only needs
                to live under AuthSessionProvider.
              */}
              <ShareClaimProcessor />
              {/*
                ShareFallbackBootstrap runs the Android install-referrer
                + iOS clipboard fallbacks once on first mount, writing
                any discovered code into pendingShareClaim so the
                ShareClaimProcessor above picks it up.
              */}
              <ShareFallbackBootstrap />
              <OffScreenCaptureHostProvider>
                {children}
              </OffScreenCaptureHostProvider>
            </QueryClientProvider>
          </ConnectivityProvider>
        </TelemetryProvider>
      </AuthSessionProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

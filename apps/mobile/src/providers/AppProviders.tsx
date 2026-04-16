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
              {children}
            </QueryClientProvider>
          </ConnectivityProvider>
        </TelemetryProvider>
      </AuthSessionProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

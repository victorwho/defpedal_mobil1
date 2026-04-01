import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../design-system';
import { AuthSessionProvider } from './AuthSessionProvider';
import { NavigationLifecycleManager } from './NavigationLifecycleManager';
import { NotificationProvider } from './NotificationProvider';
import { OfflineMutationSyncManager } from './OfflineMutationSyncManager';
import { TelemetryProvider } from './TelemetryProvider';

const queryClient = new QueryClient();

export const AppProviders = ({ children }: PropsWithChildren) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <AuthSessionProvider>
        <TelemetryProvider>
          <QueryClientProvider client={queryClient}>
            <NavigationLifecycleManager />
            <OfflineMutationSyncManager />
            <NotificationProvider />
            {children}
          </QueryClientProvider>
        </TelemetryProvider>
      </AuthSessionProvider>
    </ThemeProvider>
  </SafeAreaProvider>
);

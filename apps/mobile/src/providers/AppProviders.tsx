import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthSessionProvider } from './AuthSessionProvider';
import { NavigationLifecycleManager } from './NavigationLifecycleManager';
import { OfflineMutationSyncManager } from './OfflineMutationSyncManager';
import { TelemetryProvider } from './TelemetryProvider';

const queryClient = new QueryClient();

export const AppProviders = ({ children }: PropsWithChildren) => (
  <SafeAreaProvider>
    <AuthSessionProvider>
      <TelemetryProvider>
        <QueryClientProvider client={queryClient}>
          <NavigationLifecycleManager />
          <OfflineMutationSyncManager />
          {children}
        </QueryClientProvider>
      </TelemetryProvider>
    </AuthSessionProvider>
  </SafeAreaProvider>
);

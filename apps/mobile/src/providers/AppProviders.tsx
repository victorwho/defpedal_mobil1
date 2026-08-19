import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ThemeProvider } from '../design-system';
import { ActivationLadderScheduler } from './ActivationLadderScheduler';
import { AnonMergeManager } from './AnonMergeManager';
import { AuthSessionProvider } from './AuthSessionProvider';
import { ConnectivityProvider } from './ConnectivityMonitor';
import { NavigationLifecycleManager } from './NavigationLifecycleManager';
import { DailyWeatherScheduler } from './DailyWeatherScheduler';
import { NotificationProvider } from './NotificationProvider';
import { OfflineMutationSyncManager } from './OfflineMutationSyncManager';
import { OffScreenCaptureHostProvider } from './OffScreenCaptureHost';
import { ProfileDeviceSyncManager } from './ProfileDeviceSyncManager';
import { PurchasesIdentityManager } from './PurchasesIdentityManager';
import { ShareClaimProcessor } from './ShareClaimProcessor';
import { ShareFallbackBootstrap } from './ShareFallbackBootstrap';
import { TelemetryProvider } from './TelemetryProvider';
import { UserCacheResetBridge } from './UserCacheResetBridge';

const queryClient = new QueryClient();

export const AppProviders = ({ children }: PropsWithChildren) => (
  <SafeAreaProvider>
    <ThemeProvider>
      <AuthSessionProvider>
        <TelemetryProvider>
          <ConnectivityProvider>
            <QueryClientProvider client={queryClient}>
              {/*
                UserCacheResetBridge must sit inside QueryClientProvider (needs
                useQueryClient) AND under AuthSessionProvider (needs the
                session). On user-id change it clears the React-Query cache
                and resets user-scoped Zustand state so the next account
                doesn't see stale badges/tiers/XP/Mia from the previous one.
              */}
              <UserCacheResetBridge />
              <AnonMergeManager />
              <NavigationLifecycleManager />
              <OfflineMutationSyncManager />
              <NotificationProvider />
              {/*
                ProfileDeviceSyncManager pushes device timezone + app locale
                to the profile once per session so server-side quiet hours
                and push copy use real values, not schema-era defaults.
              */}
              <ProfileDeviceSyncManager />
              {/* Ties the store SDK to the signed-in account so a
                  subscription cannot follow the device to the next rider. */}
              <PurchasesIdentityManager />
              <DailyWeatherScheduler />
              {/*
                ActivationLadderScheduler mounted AFTER DailyWeatherScheduler:
                the weather scheduler owns the one-and-only notification
                permission prompt; the ladder only reads permission state.
              */}
              <ActivationLadderScheduler />
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

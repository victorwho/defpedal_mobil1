import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { mobileEnv } from '../src/lib/env';
import { AppProviders } from '../src/providers/AppProviders';
import { telemetry } from '../src/lib/telemetry';
import { mobileTheme } from '../src/lib/theme';

const RouteTelemetryObserver = () => {
  const pathname = usePathname();
  const lastScreenRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastScreenRef.current === pathname) {
      return;
    }

    lastScreenRef.current = pathname;
    telemetry.screen(pathname, {
      app_env: mobileEnv.appEnv,
      app_variant: mobileEnv.appVariant,
    });
  }, [pathname]);

  return null;
};

export default function RootLayout() {
  const showValidationOverlay = mobileEnv.validationMode === 'android-native-validate';

  if (__DEV__ && showValidationOverlay) {
    console.log('validation: RootLayout render', {
      bundleId: mobileEnv.validationBundleId || 'missing',
      mode: mobileEnv.validationMode,
    });
  }

  return (
    <AppProviders>
      <StatusBar style="light" />
      <RouteTelemetryObserver />
      {showValidationOverlay ? (
        <View pointerEvents="none" style={styles.validationOverlay}>
          <Text style={styles.validationLabel}>Validation build active</Text>
          <Text style={styles.validationValue}>
            {mobileEnv.validationBundleId || 'bundle id unavailable'}
          </Text>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: mobileTheme.colors.background,
          },
        }}
      />
    </AppProviders>
  );
}

const styles = StyleSheet.create({
  validationOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 20,
    borderRadius: 12,
    backgroundColor: 'rgba(11, 16, 32, 0.94)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  validationLabel: {
    color: mobileTheme.colors.brand,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  validationValue: {
    color: mobileTheme.colors.textOnDarkMuted,
    fontSize: 11,
  },
});

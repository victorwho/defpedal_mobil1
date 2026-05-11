/**
 * Design System v1.0 — ErrorBoundary Organism
 *
 * Global error boundary that catches JavaScript runtime errors
 * and provides users with a recovery option instead of a blank screen.
 */
import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { telemetry } from '../../lib/telemetry';
import { useAppStore } from '../../store/appStore';
import { Mascot } from '../atoms/Mascot';
import { darkTheme } from '../tokens/colors';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, text2xl, textBase, textSm } from '../tokens/typography';

// Small functional sub-component so we can use hooks inside the class boundary.
// Falls back to the warning icon when the mascot is suppressed (opt-out or
// during navigation), so the screen never renders without a visual anchor.
function CrashIllustration(): React.ReactElement {
  const showMascot = useAppStore((s) => s.showMascot);
  const appState = useAppStore((s) => s.appState);
  const mascotSuppressed = !showMascot || appState === 'NAVIGATING';

  if (mascotSuppressed) {
    return (
      <View style={styles.iconContainer}>
        <Ionicons name="warning-outline" size={48} color={darkTheme.caution} />
      </View>
    );
  }
  return <Mascot pose="trapeze" size="lg" accessibilityLabel="Pedal hanging from a trapeze" />;
}

// Lazy-loaded so a missing expo-updates native module (e.g. local dev build
// without the package linked) cannot crash the error UI itself. Mirrors the
// guard discipline used for expo-notifications / expo-sharing.
type ExpoUpdatesModule = {
  reloadAsync: () => Promise<void>;
};

const loadExpoUpdates = async (): Promise<ExpoUpdatesModule | null> => {
  try {
    const mod = (await import('expo-updates')) as unknown as ExpoUpdatesModule;
    return typeof mod.reloadAsync === 'function' ? mod : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    telemetry.captureError(error, {
      component_stack: errorInfo.componentStack ?? null,
      source: 'ErrorBoundary',
    });
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleRestart = (): void => {
    // Force a full JS reload so persistent errors don't trap users on the
    // boundary screen. Falls back to a state-only reset if the native module
    // is unavailable (e.g. dev build without the package linked).
    void (async () => {
      const updates = await loadExpoUpdates();
      if (updates) {
        try {
          await updates.reloadAsync();
          return;
        } catch (error) {
          telemetry.captureError(error, { source: 'ErrorBoundary.reloadAsync' });
        }
      }
      this.setState({ hasError: false, error: null });
    })();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.content}>
            {/* Illustration — mascot when available, warning icon otherwise */}
            <CrashIllustration />

            {/* Title */}
            <Text style={styles.title}>Hang in there</Text>

            {/* Description */}
            <Text style={styles.description}>
              Something tripped us up. You can try again or restart the app.
            </Text>

            {/* Error details (dev only) */}
            {__DEV__ && this.state.error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText} numberOfLines={4}>
                  {this.state.error.message}
                </Text>
              </View>
            ) : null}

            {/* Actions */}
            <View style={styles.actions}>
              <Pressable
                style={styles.primaryButton}
                onPress={this.handleRetry}
                accessibilityRole="button"
                accessibilityLabel="Try again"
              >
                <Ionicons name="refresh-outline" size={20} color={darkTheme.textPrimary} />
                <Text style={styles.primaryButtonText}>Try Again</Text>
              </Pressable>

              <Pressable
                style={styles.secondaryButton}
                onPress={this.handleRestart}
                accessibilityRole="button"
                accessibilityLabel="Restart app"
              >
                <Ionicons name="power-outline" size={18} color={darkTheme.textSecondary} />
                <Text style={styles.secondaryButtonText}>Restart App</Text>
              </Pressable>
            </View>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Styles (static — error boundary uses dark theme always for consistency)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: darkTheme.bgDeep,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[6],
  },
  content: {
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    gap: space[4],
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: darkTheme.bgSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space[2],
  },
  title: {
    ...text2xl,
    fontFamily: fontFamily.heading.bold,
    color: darkTheme.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...textBase,
    color: darkTheme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBox: {
    width: '100%',
    backgroundColor: darkTheme.bgTertiary,
    borderRadius: radii.md,
    padding: space[3],
    marginTop: space[2],
  },
  errorText: {
    ...textSm,
    fontFamily: fontFamily.mono.medium,
    color: darkTheme.danger,
  },
  actions: {
    width: '100%',
    gap: space[3],
    marginTop: space[4],
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    backgroundColor: darkTheme.accent,
    borderRadius: radii.lg,
    paddingVertical: space[3] + space[1],
    paddingHorizontal: space[6],
  },
  primaryButtonText: {
    ...textBase,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textPrimary,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    backgroundColor: 'transparent',
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    paddingVertical: space[3],
    paddingHorizontal: space[6],
  },
  secondaryButtonText: {
    ...textSm,
    fontFamily: fontFamily.body.semiBold,
    color: darkTheme.textSecondary,
  },
});

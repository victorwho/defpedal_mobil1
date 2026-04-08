/**
 * Vitest setup for React Native testing
 *
 * react-native is mocked via resolve alias in vitest.config.ts → vitest.mock-rn.ts
 * (react-native/index.js contains Flow syntax that Vite/Rollup cannot parse).
 *
 * Other React Native ecosystem modules are mocked below.
 */
import { vi } from 'vitest';

// Mock react-native-safe-area-context
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

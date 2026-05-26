/**
 * Vitest setup for React Native testing
 *
 * react-native is mocked via resolve alias in vitest.config.ts → vitest.mock-rn.ts
 * (react-native/index.js contains Flow syntax that Vite/Rollup cannot parse).
 *
 * Other React Native ecosystem modules are mocked below.
 */
import { vi } from 'vitest';

// React Native injects `__DEV__` globally via Metro. expo-modules-core's
// setUpJsLogger.fx.ts reads it at module load and crashes with
// "ReferenceError: __DEV__ is not defined" in the vitest node environment.
// Defining it here keeps any expo module that pulls expo-modules-core
// transitively from blowing up during test collection.
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// expo-modules-core's EventEmitter / NativeModule / SharedObject all resolve
// from `globalThis.expo` at module load (e.g. EventEmitter.ts:22 reads
// `globalThis.expo.EventEmitter`). The native runtime installs that global;
// in vitest's Node environment it's missing, so the module-load access
// throws "Cannot read properties of undefined (reading 'EventEmitter')".
// Stub the surface so test-time imports don't blow up. Real interactions
// with these primitives still need per-test mocks of the consuming module.
(globalThis as unknown as { expo: Record<string, unknown> }).expo = {
  EventEmitter: class {
    addListener() { return { remove() {} }; }
    removeAllListeners() {}
    removeListener() {}
    emit() {}
  },
  NativeModule: class {},
  SharedObject: class {},
  SharedRef: class {},
  modules: {},
};

// Mock react-native-safe-area-context
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

// expo-secure-store throws "Cannot find native module 'ExpoSecureStore'"
// at module load when no native runtime is present. The Supabase client
// uses it as its session storage; any test that transitively imports
// `lib/supabase.ts` (which happens through `useAppStore` → many of our
// hooks) will fail to collect without this stub.
vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn().mockResolvedValue(null),
  setItemAsync: vi.fn().mockResolvedValue(undefined),
  deleteItemAsync: vi.fn().mockResolvedValue(undefined),
  isAvailableAsync: vi.fn().mockResolvedValue(false),
  WHEN_UNLOCKED: 'WHEN_UNLOCKED',
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  ALWAYS: 'ALWAYS',
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  ALWAYS_THIS_DEVICE_ONLY: 'ALWAYS_THIS_DEVICE_ONLY',
}));

// expo-constants also calls into native at module load. Test code only ever
// reads metadata-shaped fields (scheme, expoConfig.extra), so a static
// pass-through is sufficient.
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: { scheme: 'defensivepedal-dev', extra: {} },
    manifest: null,
    manifest2: null,
    statusBarHeight: 0,
    deviceName: 'vitest',
    isDevice: false,
    platform: { ios: undefined, android: undefined, web: undefined },
  },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'storeClient' },
}));

// expo-router ships JSX inside `.ts` files (e.g. exports.ts), which vitest
// can't parse without a JSX-aware loader. Provide a default mock so any
// test that touches design-system components transitively (which import
// `usePathname` from expo-router via ThemeContext) doesn't fail to load.
// Per-test `vi.mock('expo-router', ...)` calls override this default.
vi.mock('expo-router', () => ({
  router: {
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
    navigate: vi.fn(),
    setParams: vi.fn(),
    canGoBack: () => false,
  },
  usePathname: () => '/',
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  useGlobalSearchParams: () => ({}),
  useFocusEffect: vi.fn(),
  useNavigation: () => ({}),
  useSegments: () => [],
  Link: ({ children }: { children: React.ReactNode }) => children,
  Redirect: () => null,
  Stack: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, {
    Screen: () => null,
  }),
  Tabs: Object.assign(({ children }: { children?: React.ReactNode }) => children ?? null, {
    Screen: () => null,
  }),
  Slot: ({ children }: { children?: React.ReactNode }) => children ?? null,
}));

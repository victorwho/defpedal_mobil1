import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import {
  buildDeveloperBypassSession,
  isDeveloperBypassConfigured,
  isMobileAuthSession,
  type MobileAuthSession,
} from './devAuth';
import { mobileEnv } from './env';

// Resolve the app's deep link scheme for OAuth redirects
const appScheme =
  (Constants.expoConfig?.scheme as string | undefined) ?? 'defensivepedal-dev';

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const DEV_AUTH_SESSION_KEY = 'defensivepedal.dev-auth-session';
const authSessionListeners = new Set<() => void>();

const emitAuthSessionChange = () => {
  authSessionListeners.forEach((listener) => {
    listener();
  });
};

// supabase-js logs `AuthApiError: Invalid Refresh Token: Refresh Token not
// found` to console.error whenever a stored session's refresh token has
// expired. The library still gracefully returns `{ session: null }` and our
// AuthSessionProvider falls through to anonymous sign-in — so the message
// is purely cosmetic noise. In dev mode this triggers RN's LogBox overlay,
// and in production it spams Sentry. Filter just this one message at
// console.error; everything else is passed through unchanged.
const REFRESH_TOKEN_NOISE_PATTERNS = [
  'Invalid Refresh Token: Refresh Token not found',
  'Invalid Refresh Token: Already Used',
];
const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const first = args[0];
  const message = first instanceof Error ? first.message : typeof first === 'string' ? first : '';
  if (REFRESH_TOKEN_NOISE_PATTERNS.some((p) => message.includes(p))) {
    return;
  }
  originalConsoleError(...args);
};

export const supabaseClient =
  mobileEnv.supabaseUrl && mobileEnv.supabaseAnonKey
    ? createClient(mobileEnv.supabaseUrl, mobileEnv.supabaseAnonKey, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          flowType: 'pkce',
        },
      })
    : null;

export const isSupabaseConfigured = () => Boolean(supabaseClient);
export const isDeveloperAuthBypassAvailable = () => isDeveloperBypassConfigured(mobileEnv);

const requireSupabaseClient = () => {
  if (!supabaseClient) {
    throw new Error(
      'Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  return supabaseClient;
};

const toMobileAuthSession = (
  accessToken: string,
  user: {
    id: string;
    email?: string | null;
    is_anonymous?: boolean;
  },
): MobileAuthSession => ({
  accessToken,
  provider: 'supabase',
  user: {
    id: user.id,
    email: user.email ?? null,
    provider: 'supabase',
  },
  isAnonymous: user.is_anonymous === true,
});

const getCurrentSupabaseSession = async (): Promise<MobileAuthSession | null> => {
  if (!supabaseClient) {
    return null;
  }

  const {
    data: { session },
  } = await supabaseClient.auth.getSession();

  if (!session) {
    return null;
  }

  return toMobileAuthSession(session.access_token, session.user);
};

const clearDeveloperBypassSession = async () => {
  await secureStorage.removeItem(DEV_AUTH_SESSION_KEY);
  emitAuthSessionChange();
};

export const activateDeveloperBypassSession = async (): Promise<MobileAuthSession> => {
  const session = buildDeveloperBypassSession(mobileEnv);

  if (!session) {
    throw new Error(
      'Developer auth bypass is not configured. Set DEV_AUTH_BYPASS_* values before using it.',
    );
  }

  await secureStorage.setItem(DEV_AUTH_SESSION_KEY, JSON.stringify(session));
  emitAuthSessionChange();
  return session;
};

// Keeps the most recent anonymous sign-in failure around so that Diagnostics
// and auth-error UI can surface *why* the app dropped into guest mode. The
// previous code returned null silently, leaving no way to tell the difference
// between "anon auth is disabled at the Supabase project level" and a network
// blip. Stored as a module-level value rather than React state because the
// failure can originate from both the provider mount and explicit sign-out
// paths (profile.tsx), and both should be able to surface it.
let lastAnonSignInError: string | null = null;

export const getLastAnonSignInError = (): string | null => lastAnonSignInError;

export const signInAnonymously = async (): Promise<MobileAuthSession | null> => {
  const client = requireSupabaseClient();

  try {
    const { data, error } = await client.auth.signInAnonymously();

    if (error) {
      lastAnonSignInError = error.message || 'Anonymous sign-in failed.';
      return null;
    }

    if (!data.session) {
      lastAnonSignInError = 'Anonymous sign-in returned no session.';
      return null;
    }

    lastAnonSignInError = null;
    emitAuthSessionChange();
    return toMobileAuthSession(data.session.access_token, data.session.user);
  } catch (err) {
    lastAnonSignInError = err instanceof Error ? err.message : String(err);
    return null;
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  await clearDeveloperBypassSession();
  return requireSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });
};

export const signUpWithEmail = async (email: string, password: string) => {
  await clearDeveloperBypassSession();
  const client = requireSupabaseClient();

  // Email confirmation links are https:// and cannot open a custom scheme
  // directly from an email client. We route through an HTTPS intermediary
  // edge function that JS-redirects to ${appScheme}://auth/callback while
  // preserving the PKCE code appended by Supabase.
  const supabaseUrl = mobileEnv.supabaseUrl ?? '';
  const emailRedirectTo = `${supabaseUrl}/functions/v1/email-confirm?scheme=${encodeURIComponent(appScheme)}`;

  return client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
    },
  });
};

// GoogleSignin.configure() only needs to run once per process; guard so we
// don't reconfigure on every sign-in attempt. This intentionally never resets:
// there is exactly one webClientId per process lifetime, so don't try to swap
// the webClientId at runtime — this flag would make the second configure() a
// no-op.
let googleSigninConfigured = false;

/**
 * Sign in with Google using the native account picker, then exchange the
 * Google ID token for a Supabase session via signInWithIdToken.
 *
 * This replaces the previous browser/PKCE flow (signInWithOAuth + an HTTPS
 * edge-function intermediary). The native picker shows the OS account sheet —
 * no Chrome Custom Tab, and crucially the user never sees "…supabase.co",
 * because Google is no longer brokered through the Supabase callback URL.
 *
 * Requires EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID — the SAME web client configured in
 * the Supabase Google provider, so the ID token's audience is already trusted —
 * plus an Android OAuth client in the same GCP project keyed by package name +
 * signing SHA-1. The native module is lazy-required (project convention: never
 * top-level import native modules; keeps Vitest/happy-dom and any non-GMS
 * device safe).
 *
 * Returns `cancelled: true` (with no error) when the user dismisses the picker,
 * so callers can distinguish a deliberate cancel from a real failure.
 */
export const signInWithGoogle = async (): Promise<{
  error: Error | null;
  cancelled?: boolean;
}> => {
  const client = requireSupabaseClient();
  await clearDeveloperBypassSession();

  const webClientId = mobileEnv.googleWebClientId;
  if (!webClientId) {
    return {
      error: new Error(
        'Google sign-in is not configured (missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID).',
      ),
    };
  }

  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin') as typeof import('@react-native-google-signin/google-signin');
  } catch {
    return { error: new Error('Google sign-in is unavailable in this build.') };
  }
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;

  try {
    if (!googleSigninConfigured) {
      GoogleSignin.configure({ webClientId });
      googleSigninConfigured = true;
    }

    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();

    // User dismissed the picker — a deliberate cancel, not an error.
    if (!isSuccessResponse(response)) {
      return { error: null, cancelled: true };
    }

    const idToken = response.data.idToken;
    if (!idToken) {
      return { error: new Error('Google sign-in did not return an ID token.') };
    }

    const { error } = await client.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });
    if (error) return { error };

    emitAuthSessionChange();
    return { error: null };
  } catch (err) {
    // Older devices / One Tap surface a cancel as a thrown status code.
    if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) {
      return { error: null, cancelled: true };
    }
    return {
      error: err instanceof Error ? err : new Error('Google sign-in failed.'),
    };
  }
};

export const signOut = async () => {
  await clearDeveloperBypassSession();

  if (!supabaseClient) {
    return {
      error: null,
    };
  }

  return supabaseClient.auth.signOut();
};

export const getCurrentSession = async (): Promise<MobileAuthSession | null> => {
  const persistedDeveloperSession = await secureStorage.getItem(DEV_AUTH_SESSION_KEY);

  if (persistedDeveloperSession) {
    try {
      const parsed = JSON.parse(persistedDeveloperSession) as unknown;

      if (isMobileAuthSession(parsed)) {
        // Normalize old persisted sessions that lack isAnonymous
        return { ...parsed, isAnonymous: parsed.isAnonymous ?? false };
      }
    } catch {
      // Ignore malformed payloads and fall back to the Supabase session.
    }
  }

  return getCurrentSupabaseSession();
};

export const getAccessToken = async (): Promise<string | null> => {
  const session = await getCurrentSession();
  return session?.accessToken ?? null;
};

/**
 * Force-refresh the Supabase session and return the new access token.
 * Returns null if the refresh fails or Supabase is not configured.
 */
export const refreshAccessToken = async (): Promise<string | null> => {
  if (!supabaseClient) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.refreshSession();

  if (error || !data.session) {
    return null;
  }

  return data.session.access_token;
};

export const subscribeToAuthSessionChanges = (listener: () => void) => {
  authSessionListeners.add(listener);

  return () => {
    authSessionListeners.delete(listener);
  };
};

import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

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

export const supabaseClient =
  mobileEnv.supabaseUrl && mobileEnv.supabaseAnonKey
    ? createClient(mobileEnv.supabaseUrl, mobileEnv.supabaseAnonKey, {
        auth: {
          storage: secureStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
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
  },
): MobileAuthSession => ({
  accessToken,
  provider: 'supabase',
  user: {
    id: user.id,
    email: user.email ?? null,
    provider: 'supabase',
  },
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

export const signInWithEmail = async (email: string, password: string) => {
  await clearDeveloperBypassSession();
  return requireSupabaseClient().auth.signInWithPassword({
    email,
    password,
  });
};

export const signUpWithEmail = async (email: string, password: string) => {
  await clearDeveloperBypassSession();
  return requireSupabaseClient().auth.signUp({
    email,
    password,
  });
};

/**
 * Sign in with Google via Supabase OAuth.
 * Opens a web browser for Google consent, then handles the redirect back.
 */
export const signInWithGoogle = async (): Promise<{
  error: Error | null;
}> => {
  const client = requireSupabaseClient();
  await clearDeveloperBypassSession();

  const redirectUrl = `${appScheme}://auth/callback`;

  // 1. Get the OAuth URL from Supabase
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      skipBrowserRedirect: true, // We'll handle the browser ourselves
    },
  });

  if (error || !data.url) {
    return { error: error ?? new Error('Failed to get OAuth URL from Supabase.') };
  }

  // 2. Open the browser for Google sign-in
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);

  if (result.type !== 'success' || !result.url) {
    return { error: new Error('Google sign-in was cancelled.') };
  }

  // 3. Extract tokens from the redirect URL
  // Supabase appends tokens as URL fragment: #access_token=...&refresh_token=...
  const url = result.url;
  const fragmentString = url.includes('#') ? url.split('#')[1] : '';
  const params = new URLSearchParams(fragmentString);

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return { error: new Error('Missing tokens in OAuth callback.') };
  }

  // 4. Set the session in Supabase client
  const { error: sessionError } = await client.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (sessionError) {
    return { error: sessionError };
  }

  emitAuthSessionChange();
  return { error: null };
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
        return parsed;
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

export const subscribeToAuthSessionChanges = (listener: () => void) => {
  authSessionListeners.add(listener);

  return () => {
    authSessionListeners.delete(listener);
  };
};

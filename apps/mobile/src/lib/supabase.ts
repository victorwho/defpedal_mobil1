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

// ── OAuth callback coordination ──
// signInWithGoogle() opens the browser and waits for the deep link handler
// (in AuthSessionProvider) to resolve the PKCE code exchange. This eliminates
// the previous race condition where three code paths could set the session.
const OAUTH_TIMEOUT_MS = 20_000;

let oauthCallbackResolver: ((url: string) => void) | null = null;

/**
 * Called by AuthSessionProvider's deep link handler when an OAuth callback
 * URL arrives. Resolves the Promise that signInWithGoogle() is awaiting.
 */
export const resolveOAuthCallback = (url: string) => {
  if (oauthCallbackResolver) {
    oauthCallbackResolver(url);
    oauthCallbackResolver = null;
  }
};

/**
 * Returns true when signInWithGoogle() is actively waiting for a callback.
 * The deep link handler in AuthSessionProvider uses this to decide whether
 * to forward the URL via resolveOAuthCallback (preferred) or handle it
 * independently (cold-start fallback).
 */
export const isOAuthInProgress = () => oauthCallbackResolver !== null;

/**
 * Extract a PKCE authorization code from an OAuth callback URL.
 */
const extractCodeFromUrl = (url: string): string | null => {
  const queryString = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
  const params = new URLSearchParams(queryString ?? '');
  return params.get('code');
};

/**
 * Sign in with Google via Supabase OAuth (PKCE flow).
 *
 * 1. Gets an OAuth URL from Supabase.
 * 2. Opens a browser that redirects through a web intermediary (edge function)
 *    which performs a JS redirect to the app's custom scheme — avoiding the
 *    Android Chrome Custom Tab 302-to-custom-scheme failure.
 * 3. Waits for AuthSessionProvider's deep link handler to forward the callback
 *    URL, then exchanges the PKCE code for a session.
 */
export const signInWithGoogle = async (): Promise<{
  error: Error | null;
}> => {
  const client = requireSupabaseClient();
  await clearDeveloperBypassSession();

  // The deep link URL the app will ultimately receive
  const appCallbackUrl = `${appScheme}://auth/callback`;

  // The HTTPS intermediary that Supabase will 302 to. It serves a tiny HTML
  // page whose JS redirects to the custom scheme (works on Android).
  const supabaseUrl = mobileEnv.supabaseUrl ?? '';
  const intermediaryUrl = `${supabaseUrl}/functions/v1/oauth-redirect?scheme=${encodeURIComponent(appScheme)}`;

  // 1. Get the OAuth URL from Supabase, redirecting to the intermediary
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: intermediaryUrl,
      skipBrowserRedirect: true,
      queryParams: {
        prompt: 'select_account',
      },
    },
  });

  if (error || !data.url) {
    return { error: error ?? new Error('Failed to get OAuth URL from Supabase.') };
  }

  // 2. Set up a Promise that resolves when the deep link handler forwards
  //    the OAuth callback URL to us (or rejects on timeout).
  const callbackUrlPromise = new Promise<string>((resolve, reject) => {
    oauthCallbackResolver = resolve;

    setTimeout(() => {
      if (oauthCallbackResolver === resolve) {
        oauthCallbackResolver = null;
        reject(new Error('Google sign-in timed out. Please try again.'));
      }
    }, OAUTH_TIMEOUT_MS);
  });

  // 3. Open the browser. On iOS, WebBrowser may intercept the redirect and
  //    return the URL directly. On Android, the deep link handler catches it.
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    appCallbackUrl,
  );

  // 4. Determine the callback URL from whichever path delivered it
  let callbackUrl: string | null = null;

  if (result.type === 'success' && result.url) {
    // iOS path: WebBrowser intercepted the redirect
    callbackUrl = result.url;
    oauthCallbackResolver = null; // No longer needed
  } else {
    // Android path (or iOS fallback): wait for the deep link handler
    try {
      callbackUrl = await callbackUrlPromise;
    } catch (err) {
      return { error: err instanceof Error ? err : new Error('Google sign-in failed.') };
    }
  }

  // 5. Exchange the PKCE code for a session
  const code = extractCodeFromUrl(callbackUrl);
  if (!code) {
    return { error: new Error('Missing authorization code in OAuth callback.') };
  }

  const { error: codeError } = await client.auth.exchangeCodeForSession(code);
  if (codeError) return { error: codeError };

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

import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import {
  buildDeveloperBypassSession,
  isDeveloperBypassConfigured,
  isMobileAuthSession,
  type MobileAuthSession,
} from './devAuth';
import { mobileEnv } from './env';

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

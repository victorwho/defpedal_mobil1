import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';

import type { MobileAuthSession, MobileAuthUser } from '../lib/devAuth';
import {
  activateDeveloperBypassSession,
  getCurrentSession,
  isDeveloperAuthBypassAvailable,
  isOAuthInProgress,
  isSupabaseConfigured,
  resolveOAuthCallback,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail,
  subscribeToAuthSessionChanges,
  supabaseClient,
} from '../lib/supabase';

type AuthSessionContextValue = {
  session: MobileAuthSession | null;
  user: MobileAuthUser | null;
  isLoading: boolean;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
  isDeveloperBypassAvailable: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInWithEmail: typeof signInWithEmail;
  signUpWithEmail: typeof signUpWithEmail;
  signInWithGoogle: typeof signInWithGoogle;
  signInWithDeveloperBypass: typeof activateDeveloperBypassSession;
  signOut: typeof signOut;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

export const AuthSessionProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<MobileAuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const syncCurrentSession = async () => {
      const currentSession = await getCurrentSession();

      if (isMounted) {
        setSession(currentSession);
        setIsLoading(false);
      }
    };

    void syncCurrentSession();

    const unsubscribe = subscribeToAuthSessionChanges(() => {
      void syncCurrentSession();
    });
    const subscription = supabaseClient?.auth.onAuthStateChange(() => {
      void syncCurrentSession();
    }).data.subscription;

    return () => {
      isMounted = false;
      unsubscribe();
      subscription?.unsubscribe();
    };
  }, []);

  // ── Handle OAuth deep link callback ──
  // When the browser redirects back to the app via the custom scheme,
  // forward the URL to signInWithGoogle() if it is actively waiting.
  // On cold start (app was killed), handle the code exchange directly.
  useEffect(() => {
    const handleOAuthDeepLink = async (url: string) => {
      if (!url.includes('auth/callback')) return;

      // Preferred path: signInWithGoogle() is awaiting this callback.
      // Forward the URL so it handles the PKCE exchange in one place.
      if (isOAuthInProgress()) {
        resolveOAuthCallback(url);
        return;
      }

      // Cold-start fallback: the app was killed after opening the browser.
      // The PKCE verifier may be lost, but attempt the exchange anyway —
      // Supabase persists the verifier in secure storage.
      if (!supabaseClient) return;

      try {
        const queryString = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
        const params = new URLSearchParams(queryString ?? '');
        const code = params.get('code');

        if (code) {
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) {
            setAuthError(`Sign-in failed: ${error.message}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setAuthError(`Sign-in failed: ${message}`);
        console.warn('OAuth cold-start callback error:', err);
      }
    };

    // Handle the URL that opened the app (cold start)
    void Linking.getInitialURL().then((url) => {
      if (url) void handleOAuthDeepLink(url);
    });

    // Handle deep links while the app is running (warm start)
    const linkingSub = Linking.addEventListener('url', (event) => {
      void handleOAuthDeepLink(event.url);
    });

    return () => {
      linkingSub.remove();
    };
  }, []);

  const clearAuthError = () => setAuthError(null);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured() || isDeveloperAuthBypassAvailable(),
      isSupabaseConfigured: isSupabaseConfigured(),
      isDeveloperBypassAvailable: isDeveloperAuthBypassAvailable(),
      authError,
      clearAuthError,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInWithDeveloperBypass: activateDeveloperBypassSession,
      signOut,
    }),
    [isLoading, session, authError],
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
};

export const useAuthSession = () => {
  const context = useContext(AuthSessionContext);

  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider.');
  }

  return context;
};

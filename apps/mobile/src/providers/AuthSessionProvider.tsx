import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';

import type { MobileAuthSession, MobileAuthUser } from '../lib/devAuth';
import {
  activateDeveloperBypassSession,
  getCurrentSession,
  isDeveloperAuthBypassAvailable,
  isSupabaseConfigured,
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
  // When WebBrowser.openAuthSessionAsync doesn't intercept the redirect
  // (common on Android), the OS opens the deep link. We catch it here,
  // extract tokens from the URL fragment, and set the Supabase session.
  useEffect(() => {
    const handleOAuthDeepLink = async (url: string) => {
      if (!url.includes('auth/callback') || !supabaseClient) return;

      try {
        // Implicit flow: tokens in URL fragment (#access_token=...&refresh_token=...)
        const fragmentString = url.includes('#') ? url.split('#')[1] : '';
        const fragParams = new URLSearchParams(fragmentString);
        const accessToken = fragParams.get('access_token');
        const refreshToken = fragParams.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabaseClient.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          return;
        }

        // PKCE flow: code in query string (?code=...)
        const queryString = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
        const queryParams = new URLSearchParams(queryString ?? '');
        const code = queryParams.get('code');

        if (code) {
          await supabaseClient.auth.exchangeCodeForSession(code);
        }
      } catch (err) {
        console.warn('OAuth callback session error:', err);
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

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isConfigured: isSupabaseConfigured() || isDeveloperAuthBypassAvailable(),
      isSupabaseConfigured: isSupabaseConfigured(),
      isDeveloperBypassAvailable: isDeveloperAuthBypassAvailable(),
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInWithDeveloperBypass: activateDeveloperBypassSession,
      signOut,
    }),
    [isLoading, session],
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

import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import type { MobileAuthSession, MobileAuthUser } from '../lib/devAuth';
import { registerForPushNotifications } from '../lib/push-notifications';
import {
  activateDeveloperBypassSession,
  getCurrentSession,
  isDeveloperAuthBypassAvailable,
  isOAuthInProgress,
  isSupabaseConfigured,
  resolveOAuthCallback,
  signInAnonymously,
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
  isAnonymous: boolean;
  isConfigured: boolean;
  isSupabaseConfigured: boolean;
  isDeveloperBypassAvailable: boolean;
  authError: string | null;
  clearAuthError: () => void;
  signInAnonymously: typeof signInAnonymously;
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
    let anonSignInAttempted = false;

    const syncCurrentSession = async (allowAnonSignIn: boolean) => {
      let currentSession: MobileAuthSession | null = null;

      try {
        currentSession = await getCurrentSession();
      } catch {
        // Stale/invalid refresh token — clear only the local session so the
        // app falls through to anonymous sign-in. Avoid signOut() here because
        // it calls the server (which fails on an invalid token) and emits
        // onAuthStateChange events that re-enter this function.
        try {
          await supabaseClient?.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore — the session may already be gone
        }
      }

      // Auto-sign-in anonymously on first launch only (not on auth state changes)
      if (!currentSession && allowAnonSignIn && !anonSignInAttempted && isSupabaseConfigured()) {
        anonSignInAttempted = true;
        currentSession = await signInAnonymously();
      }

      if (isMounted) {
        setSession(currentSession);
        setIsLoading(false);
      }
    };

    // Initial mount: allow anonymous sign-in
    void syncCurrentSession(true);

    // Auth state changes: only sync, never trigger anonymous sign-in.
    // subscribeToAuthSessionChanges covers developer bypass + all explicit auth ops.
    const unsubscribe = subscribeToAuthSessionChanges(() => {
      void syncCurrentSession(false);
    });

    // Also listen to Supabase's native onAuthStateChange as a safety net.
    // This catches code exchanges that bypass our custom emitter (e.g. the
    // cold-start OAuth fallback that calls exchangeCodeForSession directly).
    const { data: { subscription: supabaseSub } } = supabaseClient?.auth.onAuthStateChange(
      (_event, _session) => {
        if (isMounted) void syncCurrentSession(false);
      },
    ) ?? { data: { subscription: null } };

    return () => {
      isMounted = false;
      unsubscribe();
      supabaseSub?.unsubscribe();
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

      // Cold-start fallback: the app was killed or the activity restarted
      // after opening the browser. The PKCE verifier may be lost, but
      // attempt the exchange anyway — Supabase persists it in secure storage.
      if (!supabaseClient) return;

      // Close the Chrome Custom Tab that's showing a blank page
      void WebBrowser.dismissBrowser();

      try {
        const queryString = url.includes('?') ? url.split('?')[1]?.split('#')[0] : '';
        const params = new URLSearchParams(queryString ?? '');

        // Supabase may surface an error in the redirect (expired link, etc.)
        const errorCode = params.get('error');
        const errorDescription = params.get('error_description');
        if (errorCode) {
          setAuthError(
            `Sign-in failed: ${errorDescription?.replace(/\+/g, ' ') ?? errorCode}`,
          );
          return;
        }

        const code = params.get('code');
        const tokenHash = params.get('token_hash');
        const type = params.get('type');

        if (code) {
          // PKCE flow (OAuth + email confirmation on same device).
          const { error } = await supabaseClient.auth.exchangeCodeForSession(code);
          if (error) {
            setAuthError(`Sign-in failed: ${error.message}`);
            return;
          }
        } else if (tokenHash && type) {
          // Non-PKCE email confirmation (e.g. link opened on a different
          // device where the PKCE verifier is not in SecureStore).
          const { error } = await supabaseClient.auth.verifyOtp({
            token_hash: tokenHash,
            type: type as 'signup' | 'magiclink' | 'recovery' | 'invite' | 'email_change' | 'email',
          });
          if (error) {
            setAuthError(`Sign-in failed: ${error.message}`);
            return;
          }
        } else {
          return;
        }

        // Sync the new session into React state immediately.
        // onAuthStateChange also fires, but this avoids a visible delay.
        const newSession = await getCurrentSession();
        setSession(newSession);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setAuthError(`Sign-in failed: ${message}`);
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

  // Register for push notifications when user session is available
  useEffect(() => {
    if (session?.user && !isLoading) {
      void registerForPushNotifications();
    }
  }, [session?.user?.id, isLoading]);

  const clearAuthError = () => setAuthError(null);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      isLoading,
      isAnonymous: session?.isAnonymous === true,
      isConfigured: isSupabaseConfigured() || isDeveloperAuthBypassAvailable(),
      isSupabaseConfigured: isSupabaseConfigured(),
      isDeveloperBypassAvailable: isDeveloperAuthBypassAvailable(),
      authError,
      clearAuthError,
      signInAnonymously,
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

export const useAuthSessionOptional = (): AuthSessionContextValue | null => {
  return useContext(AuthSessionContext);
};

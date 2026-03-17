import type { PropsWithChildren } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { MobileAuthSession, MobileAuthUser } from '../lib/devAuth';
import {
  activateDeveloperBypassSession,
  getCurrentSession,
  isDeveloperAuthBypassAvailable,
  isSupabaseConfigured,
  signInWithEmail,
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

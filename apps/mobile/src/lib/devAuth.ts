export type MobileAuthProvider = 'supabase' | 'dev-bypass';

export type MobileAuthUser = {
  id: string;
  email: string | null;
  provider: MobileAuthProvider;
};

export type MobileAuthSession = {
  accessToken: string;
  provider: MobileAuthProvider;
  user: MobileAuthUser;
  isAnonymous: boolean;
};

export type DeveloperBypassConfig = {
  devAuthBypassEnabled: boolean;
  devAuthBypassToken: string;
  devAuthBypassUserId: string;
  devAuthBypassEmail: string;
};

const normalizeValue = (value: string) => value.trim();

export const buildDeveloperBypassSession = (
  config: DeveloperBypassConfig,
): MobileAuthSession | null => {
  const accessToken = normalizeValue(config.devAuthBypassToken);
  const userId = normalizeValue(config.devAuthBypassUserId);
  const email = normalizeValue(config.devAuthBypassEmail);

  if (!config.devAuthBypassEnabled || !accessToken || !userId) {
    return null;
  }

  return {
    accessToken,
    provider: 'dev-bypass',
    user: {
      id: userId,
      email: email || null,
      provider: 'dev-bypass',
    },
    isAnonymous: false,
  };
};

export const isDeveloperBypassConfigured = (
  config: DeveloperBypassConfig,
) => buildDeveloperBypassSession(config) !== null;

export const isMobileAuthSession = (value: unknown): value is MobileAuthSession => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const user = candidate.user;

  if (!user || typeof user !== 'object') {
    return false;
  }

  const candidateUser = user as Record<string, unknown>;
  const provider = candidate.provider;
  const userProvider = candidateUser.provider;

  return (
    typeof candidate.accessToken === 'string' &&
    typeof candidateUser.id === 'string' &&
    (typeof candidateUser.email === 'string' || candidateUser.email === null) &&
    (provider === 'supabase' || provider === 'dev-bypass') &&
    (userProvider === 'supabase' || userProvider === 'dev-bypass') &&
    (candidate.isAnonymous === undefined || typeof candidate.isAnonymous === 'boolean')
  );
};

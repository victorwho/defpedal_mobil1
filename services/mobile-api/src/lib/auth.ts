import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

import { config } from '../config';
import { HttpError } from './http';
import { supabaseAuthClient } from './supabaseAuth';

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export type DeveloperAuthBypassConfig = {
  enabled: boolean;
  token: string;
  userId: string;
  email: string;
};

const tokensMatch = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const authenticateDeveloperBypassToken = (
  accessToken: string,
  developerAuthBypass: DeveloperAuthBypassConfig = config.devAuthBypass,
): AuthenticatedUser | null => {
  const expectedToken = developerAuthBypass.token.trim();
  const userId = developerAuthBypass.userId.trim();
  const email = developerAuthBypass.email.trim();

  if (!developerAuthBypass.enabled || !expectedToken || !userId) {
    return null;
  }

  if (!tokensMatch(accessToken, expectedToken)) {
    return null;
  }

  return {
    id: userId,
    email: email || null,
  };
};

export const authenticateUser = async (
  accessToken: string,
): Promise<AuthenticatedUser | null> => {
  const developerUser = authenticateDeveloperBypassToken(accessToken);

  if (developerUser) {
    return developerUser;
  }

  if (!supabaseAuthClient) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAuthClient.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? null,
  };
};

export const requireAuthenticatedUser = async (
  request: FastifyRequest,
  verifyAccessToken: (accessToken: string) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser> => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.toLowerCase().startsWith('bearer ')) {
    throw new HttpError('Authentication required.', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      details: ['Sign in from the mobile app before syncing trips, hazards, or feedback.'],
    });
  }

  const accessToken = authorizationHeader.slice(7).trim();
  const user = accessToken ? await verifyAccessToken(accessToken) : null;

  if (!user) {
    throw new HttpError('Authentication required.', {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      details: ['The mobile session is missing, expired, or invalid.'],
    });
  }

  return user;
};

export const requireFullUser = async (
  request: FastifyRequest,
  verifyAccessToken: (accessToken: string) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser> => {
  const user = await requireAuthenticatedUser(request, verifyAccessToken);

  // Anonymous Supabase users have no email. Reject them for sensitive operations.
  if (!user.email) {
    throw new HttpError('Full account required.', {
      statusCode: 403,
      code: 'UNAUTHORIZED',
      details: ['Sign in with Google or email to perform this action.'],
    });
  }

  return user;
};

export const getAuthenticatedUserFromRequest = async (
  request: FastifyRequest,
  verifyAccessToken: (accessToken: string) => Promise<AuthenticatedUser | null>,
): Promise<AuthenticatedUser | null> => {
  const authorizationHeader = request.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.toLowerCase().startsWith('bearer ')) {
    return null;
  }

  const accessToken = authorizationHeader.slice(7).trim();

  if (!accessToken) {
    return null;
  }

  return verifyAccessToken(accessToken);
};

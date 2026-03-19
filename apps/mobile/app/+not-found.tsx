import { Redirect } from 'expo-router';

/**
 * Catch-all for unmatched routes.
 *
 * The primary reason this exists is the OAuth callback deep link
 * (`defensivepedal-dev://auth/callback#access_token=...`).
 * AuthSessionProvider's Linking listener extracts the tokens from
 * that URL, so by the time Expo Router tries to match the route
 * there's nothing left to render — we just redirect home.
 */
export default function NotFoundScreen() {
  return <Redirect href="/" />;
}

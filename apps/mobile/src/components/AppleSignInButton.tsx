// Default (non-iOS) implementation of the Apple sign-in button.
//
// Sign in with Apple is an iOS-only feature (Apple Authentication Services has
// no Android/web equivalent). Metro resolves `AppleSignInButton.ios.tsx` on
// iOS, so on Android and web this no-op version is bundled instead. Because
// this file never imports `expo-apple-authentication`, the Android JS bundle
// has zero references to the native module — the Android build is entirely
// unaffected by the iOS sign-in work.

export interface AppleSignInButtonProps {
  /** Called when the native sign-in flow starts (after the user taps). */
  onStart?: () => void;
  /** Called after a Supabase session is established from the Apple token. */
  onSuccess?: () => void;
  /** Called with a user-facing message when sign-in fails (cancel is silent). */
  onError?: (message: string) => void;
}

export function AppleSignInButton(_props: AppleSignInButtonProps): null {
  return null;
}

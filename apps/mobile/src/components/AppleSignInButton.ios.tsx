// iOS implementation of the Sign in with Apple button.
//
// This file is bundled ONLY on iOS (Metro picks `.ios.tsx` over the default
// `.tsx`), so `expo-apple-authentication` is never imported into the Android or
// web bundles. The official `AppleAuthenticationButton` is used per Apple's HIG
// (Guideline 4.8 requires Apple sign-in at equal prominence to Google).
//
// Flow: generate a random nonce → SHA-256 hash it → pass the hash to Apple →
// hand the returned identity token + the RAW nonce to Supabase
// (`signInWithAppleIdToken`, which is pure supabase-js, no native import).

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '../design-system';
import { radii } from '../design-system/tokens/radii';
import { signInWithAppleIdToken } from '../lib/supabase';

import type { AppleSignInButtonProps } from './AppleSignInButton';

export function AppleSignInButton({
  onStart,
  onSuccess,
  onError,
}: AppleSignInButtonProps) {
  const { mode } = useTheme();
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((value) => {
        if (active) {
          setAvailable(value);
        }
      })
      .catch(() => {
        if (active) {
          setAvailable(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Hide entirely on devices where Apple auth isn't available (e.g. iOS < 13).
  if (!available) {
    return null;
  }

  const handlePress = async () => {
    onStart?.();
    try {
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        onError?.('Apple sign-in did not return an identity token.');
        return;
      }

      const { error } = await signInWithAppleIdToken(
        credential.identityToken,
        rawNonce,
      );
      if (error) {
        onError?.(error.message);
        return;
      }

      onSuccess?.();
    } catch (err) {
      // The user dismissing the native sheet is a deliberate cancel, not an
      // error — surface nothing.
      if (
        err instanceof Error &&
        (err as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        return;
      }
      onError?.(err instanceof Error ? err.message : 'Apple sign-in failed.');
    }
  };

  return (
    <View style={styles.wrap}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          mode === 'dark'
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={radii.xl}
        style={styles.button}
        onPress={() => void handlePress()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  button: {
    width: '100%',
    height: 52,
  },
});

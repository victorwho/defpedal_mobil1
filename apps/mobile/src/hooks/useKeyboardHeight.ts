/**
 * Height of the on-screen keyboard, in dp — 0 when it is closed.
 *
 * Why this exists rather than `KeyboardAvoidingView`: the hazard quick-report
 * panel is an `absoluteFillObject` overlay rendered as a SIBLING of the screen
 * body, so there is no flex parent for a KAV to pad. The panel is bottom-
 * anchored, which put the "Other" free-text field directly underneath the
 * keyboard — the rider could not see what they were typing.
 *
 * Android note: the manifest sets `windowSoftInputMode="adjustResize"`, which
 * used to shrink the RN root view and lift bottom-anchored content for free.
 * With `edgeToEdgeEnabled=true` (gradle.properties) the window no longer
 * resizes, so a full-bleed overlay keeps its full height and the keyboard
 * simply covers it. Callers must add this height as bottom padding themselves.
 */
import { useEffect, useState } from 'react';
import { Keyboard, Platform, type KeyboardEvent } from 'react-native';

export const useKeyboardHeight = (): number => {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // iOS emits `will*` ahead of its own animation, so the panel travels with
    // the keyboard instead of snapping after it. Android only emits `did*`.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (event: KeyboardEvent) => {
      setHeight(event.endCoordinates?.height ?? 0);
    };
    const onHide = () => setHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
};

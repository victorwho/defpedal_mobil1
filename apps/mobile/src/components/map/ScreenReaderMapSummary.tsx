/**
 * ScreenReaderMapSummary — a hidden textual representation of map state for
 * assistive technology (TalkBack on Android, VoiceOver on iOS).
 *
 * Mapbox renders map content natively; it is invisible to RN's accessibility
 * tree. This component sits as a *sibling* of `<Mapbox.MapView>` inside the
 * `RouteMap` container and exposes plain-text content that AT can read.
 *
 * Two concerns:
 *  1. `label` — a static summary, always readable when the element takes
 *     accessibility focus.
 *  2. `liveRegionText` — transient transitions that should be announced
 *     automatically (polite so they don't interrupt more urgent assertive
 *     announcements like `HazardAlert`).
 *
 * The element is sized 1×1 and transparent, and has `pointerEvents="none"`
 * so it never intercepts touches. `importantForAccessibility` + `accessible`
 * ensure AT walks into it.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

export interface ScreenReaderMapSummaryProps {
  /** Static always-current description of the map. */
  label: string;
  /**
   * Transient transition text. When this changes to a non-empty value,
   * TalkBack / VoiceOver announces it. Pass `null` when there is nothing
   * to announce.
   */
  liveRegionText?: string | null;
}

/**
 * Internal helper: forces React to re-mount the inner live-region <Text> when
 * the announcement text changes, because RN's `accessibilityLiveRegion`
 * typically only re-fires when the rendered string changes from the
 * accessibility tree's perspective. Using a key change guarantees re-announcement
 * when the same string is emitted twice (e.g. same hazard approached twice).
 */
const useAnnouncementKey = (text: string | null | undefined): number => {
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (text) setKey((k) => k + 1);
  }, [text]);
  return key;
};

export const ScreenReaderMapSummary = ({
  label,
  liveRegionText,
}: ScreenReaderMapSummaryProps) => {
  const announcementKey = useAnnouncementKey(liveRegionText);

  return (
    <View
      pointerEvents="none"
      style={styles.host}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={label}
      importantForAccessibility="yes"
    >
      {liveRegionText ? (
        <Text
          key={announcementKey}
          style={styles.liveRegion}
          accessibilityLiveRegion="polite"
          // On iOS this maps onto VoiceOver's announcement queue.
          accessibilityRole="alert"
        >
          {liveRegionText}
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    // 1x1 transparent hitbox — reachable by AT focus but invisible and
    // untouchable by sighted users.
    width: 1,
    height: 1,
    top: 0,
    left: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  liveRegion: {
    // Must render to be read by AT, but we hide it visually.
    fontSize: 1,
    color: 'transparent',
  },
});

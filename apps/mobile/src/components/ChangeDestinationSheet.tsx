/**
 * Change destination mid-ride (2026-10-10).
 *
 * A full-screen sheet over the navigation HUD: the rider picks a new place and
 * the ride re-routes from where they are, without ending the trip. Recent ride
 * destinations and saved Home/Work are listed before any typing, because the
 * rider is on a bike — the common case should be one tap. Typing is possible
 * but the sheet says to pull over first.
 *
 * The sheet only picks and resolves the place; the parent computes the new
 * route and closes the sheet on success, so a failed route keeps the sheet
 * open with the reason instead of leaving the ride pointed nowhere.
 */
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import type { AutocompleteSuggestion, Coordinate, ResolvedSuggestion } from '@defensivepedal/core';

import { useTheme, type ThemeColors } from '../design-system';
import { SearchBar } from '../design-system/molecules/SearchBar';
import { Spinner } from '../design-system/atoms';
import { radii } from '../design-system/tokens/radii';
import { space } from '../design-system/tokens/spacing';
import { fontFamily, textBase, textSm, textXl } from '../design-system/tokens/typography';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { useRecentRideDestinations } from '../hooks/useRecentRideDestinations';
import { useT } from '../hooks/useTranslation';
import { useUnits } from '../hooks/useUnits';
import { mobileApi } from '../lib/api';
import { mobileEnv } from '../lib/env';
import { resolveSuggestion } from '../lib/mapbox-search';
import { mergeRecentsWithResults } from '../lib/search-merge';
import { useAppStore } from '../store/appStore';

export interface ChangeDestinationSheetProps {
  readonly visible: boolean;
  /** Where the rider is now — biases the search towards nearby places. */
  readonly proximity: Coordinate | null;
  /** True while the parent computes the route to the picked place. */
  readonly routing: boolean;
  /** Why the last pick could not be routed to, already translated. */
  readonly errorText: string | null;
  readonly onPick: (place: ResolvedSuggestion) => void;
  readonly onClose: () => void;
}

export const ChangeDestinationSheet = ({
  visible,
  proximity,
  routing,
  errorText,
  onPick,
  onClose,
}: ChangeDestinationSheetProps) => {
  const t = useT();
  const units = useUnits();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const locale = useAppStore((s) => s.routeRequest.locale);
  const countryHint = useAppStore((s) => s.routeRequest.countryHint);
  const savedPlaces = useAppStore((s) => s.savedPlaces);
  const recentRideDestinations = useRecentRideDestinations();

  const [query, setQuery] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setLookupError(null);
    }
  }, [visible]);

  const autocomplete = useQuery({
    queryKey: ['autocomplete', 'change-destination', deferredQuery, proximity, locale, countryHint, units],
    queryFn: () =>
      mobileApi.autocomplete(
        { query: deferredQuery, proximity: proximity ?? undefined, locale, countryHint, limit: 5 },
        units,
      ),
    enabled: visible && Boolean(mobileEnv.mapboxPublicToken) && deferredQuery.length >= 2,
  });

  const suggestions = useMemo(
    () =>
      mergeRecentsWithResults(
        recentRideDestinations,
        autocomplete.data?.suggestions ?? [],
        deferredQuery,
      ),
    [recentRideDestinations, autocomplete.data, deferredQuery],
  );

  // Search results arrive without a location; one billed lookup resolves the
  // place the rider actually picks. Recents and saved places already have one.
  const handleSelect = async (suggestion: AutocompleteSuggestion) => {
    if (routing) return;
    setLookupError(null);
    const resolved = await resolveSuggestion(suggestion).catch(() => null);
    if (!resolved) {
      setLookupError(t('planning.placeNotFound'));
      return;
    }
    onPick(resolved);
  };

  const shownError = lookupError ?? errorText;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View
        style={[
          styles.root,
          { paddingTop: insets.top + space[3], paddingBottom: insets.bottom + keyboardHeight },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {t('nav.changeDestination')}
          </Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </Pressable>
        </View>

        <View style={styles.notice}>
          <Ionicons name="hand-left-outline" size={16} color={colors.caution} />
          <Text style={styles.noticeText}>{t('nav.changeDestinationSafety')}</Text>
        </View>

        <SearchBar
          label={t('nav.changeDestination')}
          value={query}
          placeholder={t('nav.changeDestinationPlaceholder')}
          active
          isLoading={autocomplete.isFetching}
          errorMessage={autocomplete.isError ? autocomplete.error.message : null}
          suggestions={suggestions}
          recentDestinations={recentRideDestinations}
          savedPlaces={savedPlaces}
          onFocus={() => undefined}
          onChangeText={setQuery}
          onClear={() => setQuery('')}
          onSelectSuggestion={(s) => void handleSelect(s)}
        />

        {routing ? (
          <View style={styles.statusRow} accessibilityLiveRegion="polite">
            <Spinner size={16} />
            <Text style={styles.statusText}>{t('nav.changeDestinationRouting')}</Text>
          </View>
        ) : shownError ? (
          <Text style={styles.errorText} accessibilityLiveRegion="assertive">
            {shownError}
          </Text>
        ) : null}
      </View>
    </Modal>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bgDeep,
      paddingHorizontal: space[4],
      gap: space[3],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      ...textXl,
      fontFamily: fontFamily.heading.bold,
      color: colors.textPrimary,
    },
    closeButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderRadius: radii.md,
      backgroundColor: colors.bgSecondary,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
    },
    noticeText: {
      ...textSm,
      flex: 1,
      fontFamily: fontFamily.body.regular,
      color: colors.textSecondary,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    statusText: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.textPrimary,
    },
    errorText: {
      ...textBase,
      fontFamily: fontFamily.body.medium,
      color: colors.danger,
    },
  });

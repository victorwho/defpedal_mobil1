import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CommutePlaceSearch } from '../src/components/CommutePlaceSearch';
import { CommuteTimePicker } from '../src/components/CommuteTimePicker';
import { Screen } from '../src/components/Screen';
import { useTheme, type ThemeColors } from '../src/design-system';
import { SettingRow } from '../src/design-system/molecules/SettingRow';
import { radii } from '../src/design-system/tokens/radii';
import { space } from '../src/design-system/tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../src/design-system/tokens/typography';
import { useT } from '../src/hooks/useTranslation';
import { ensureNotificationPermissionAsync } from '../src/lib/push-notifications';
import { telemetry } from '../src/lib/telemetry';
import { useAppStore } from '../src/store/appStore';
import { COMMUTE_LEAD_MINUTES } from '../src/store/commuteSlice';

type Place = 'home' | 'work';
type TimeField = 'depart' | 'return';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * Commute mode settings (docs/plans/commute-mode.md, step 5). Reached from
 * Profile. Turning the briefing on is the setup: it asks for notification
 * permission, then for the departure time, which has no default.
 */
export default function CommuteScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const t = useT();

  const commute = useAppStore((s) => s.commute);
  const home = useAppStore((s) => s.savedPlaces.home);
  const work = useAppStore((s) => s.savedPlaces.work);
  const placesSet = Boolean(home?.coordinates && work?.coordinates);

  const [picking, setPicking] = useState<Place | null>(null);
  const [timeField, setTimeField] = useState<TimeField | null>(null);
  // Set while setup waits for a departure time; closing the picker without
  // one leaves Commute off.
  const [setupPending, setSetupPending] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const store = () => useAppStore.getState();
  const placeName = (p: Place) => t(p === 'home' ? 'search.home' : 'search.work');

  const turnOn = async (departTime: string) => {
    store().enableCommute(departTime);
    telemetry.capture('commute_enabled', {
      days: store().commute.days.length,
      evening: store().commute.returnTime !== null,
    });
  };

  const handleToggle = async (next: boolean) => {
    if (!next) {
      store().disableCommute();
      telemetry.capture('commute_disabled');
      return;
    }
    const granted = await ensureNotificationPermissionAsync();
    setPermissionDenied(!granted);
    if (!granted) return;
    if (commute.departTime) {
      await turnOn(commute.departTime);
      return;
    }
    setSetupPending(true);
    setTimeField('depart');
  };

  const handleTimeSelected = (time: string) => {
    if (timeField === 'return') {
      store().setCommuteReturnTime(time);
      return;
    }
    store().setCommuteDepartTime(time);
    if (setupPending) {
      setSetupPending(false);
      void turnOn(time);
    }
  };

  const toggleDay = (day: number) => {
    const days = commute.days.includes(day)
      ? commute.days.filter((d) => d !== day)
      : [...commute.days, day];
    // At least one day: an empty week would silently schedule nothing.
    if (days.length > 0) store().setCommuteDays(days);
  };

  const confirmRemove = (p: Place) => {
    Alert.alert(placeName(p), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('search.removePlace'), style: 'destructive', onPress: () => store().setSavedPlace(p, null) },
    ]);
  };

  const renderPlace = (p: Place) => {
    const place = p === 'home' ? home : work;
    if (picking === p) {
      return (
        <View key={p} style={styles.searchWrap}>
          <CommutePlaceSearch
            label={t('commuteScreen.searchLabel', { place: placeName(p) })}
            onPicked={(resolved) => {
              store().setSavedPlace(p, resolved);
              setPicking(null);
            }}
            onFailed={() => Alert.alert(t('commuteScreen.searchFailed'))}
          />
          <Pressable onPress={() => setPicking(null)} hitSlop={12} accessibilityRole="button">
            <Text style={styles.link}>{t('common.cancel')}</Text>
          </Pressable>
        </View>
      );
    }
    return (
      <View key={p} style={styles.placeRow}>
        <Ionicons name={p === 'home' ? 'home-outline' : 'briefcase-outline'} size={20} color={colors.accent} />
        <View style={styles.placeText}>
          <Text style={styles.label}>{placeName(p)}</Text>
          <Text style={styles.description} numberOfLines={1}>
            {place?.primaryText ?? t('commuteScreen.notSet')}
          </Text>
        </View>
        <Pressable onPress={() => setPicking(p)} hitSlop={8} accessibilityRole="button">
          <Text style={styles.link}>{t(place ? 'search.changePlace' : 'commuteScreen.set')}</Text>
        </Pressable>
        {place ? (
          <Pressable onPress={() => confirmRemove(p)} hitSlop={8} accessibilityRole="button">
            <Text style={styles.linkMuted}>{t('search.removePlace')}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderTime = (field: TimeField, value: string | null) => (
    <Pressable
      style={styles.timeRow}
      onPress={() => setTimeField(field)}
      accessibilityRole="button"
      accessibilityLabel={`${t(field === 'depart' ? 'commuteScreen.departure' : 'commuteScreen.returnTime')}: ${value ?? t('commuteScreen.chooseTime')}`}
    >
      <Text style={styles.label}>{t(field === 'depart' ? 'commuteScreen.departure' : 'commuteScreen.returnTime')}</Text>
      <Text style={styles.timeValue}>{value ?? t('commuteScreen.chooseTime')}</Text>
    </Pressable>
  );

  return (
    <Screen title={t('commuteScreen.title')} headerVariant="back" onBack={() => router.back()}>
      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t('commuteScreen.intro')}</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t('commuteScreen.places')}</Text>
          {renderPlace('home')}
          {renderPlace('work')}
        </View>

        <View style={styles.card}>
          <SettingRow
            label={t('commuteScreen.toggle')}
            description={placesSet ? t('commuteScreen.toggleDesc', { minutes: COMMUTE_LEAD_MINUTES }) : t('commuteScreen.needsPlaces')}
            checked={commute.enabled && placesSet}
            onChange={(next) => void handleToggle(next)}
            disabled={!placesSet}
          />
          {permissionDenied ? <Text style={styles.warning}>{t('commuteScreen.permissionDenied')}</Text> : null}

          {renderTime('depart', commute.departTime)}

          <Text style={styles.label}>{t('commuteScreen.days')}</Text>
          <View style={styles.days}>
            {WEEKDAYS.map((day) => {
              const on = commute.days.includes(day);
              return (
                <Pressable
                  key={day}
                  style={[styles.day, on && styles.dayOn]}
                  onPress={() => toggleDay(day)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(`commuteScreen.day${day}`)}
                >
                  <Text style={[styles.dayText, on && styles.dayTextOn]}>{t(`commuteScreen.day${day}`)}</Text>
                </Pressable>
              );
            })}
          </View>

          <SettingRow
            label={t('commuteScreen.evening')}
            description={t('commuteScreen.eveningDesc')}
            checked={commute.returnTime !== null}
            onChange={(next) => (next ? setTimeField('return') : store().setCommuteReturnTime(null))}
          />
          {commute.returnTime !== null ? renderTime('return', commute.returnTime) : null}
        </View>

        <Text style={styles.footnote}>{t('commuteScreen.footnote')}</Text>
      </ScrollView>

      <CommuteTimePicker
        visible={timeField !== null}
        title={t(timeField === 'return' ? 'commuteScreen.returnSetupTitle' : 'commuteScreen.setupTitle')}
        value={timeField === 'return' ? commute.returnTime : commute.departTime}
        onSelect={handleTimeSelected}
        onClose={() => {
          setTimeField(null);
          setSetupPending(false);
        }}
      />
    </Screen>
  );
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    body: {
      paddingHorizontal: space[5],
      paddingTop: space[5],
      paddingBottom: space[8],
      gap: space[4],
    },
    intro: { ...textBase, color: colors.textPrimary },
    card: {
      gap: space[3],
      backgroundColor: colors.bgPrimary,
      padding: space[4],
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    sectionTitle: { ...textSm, fontFamily: fontFamily.heading.bold, color: colors.textPrimary },
    placeRow: { flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 },
    placeText: { flex: 1, gap: 2 },
    searchWrap: { gap: space[2] },
    label: { ...textBase, fontFamily: fontFamily.body.semiBold, color: colors.textPrimary },
    description: { ...textSm, color: colors.textSecondary },
    link: { ...textSm, fontFamily: fontFamily.body.semiBold, color: colors.accent },
    linkMuted: { ...textSm, color: colors.textSecondary },
    warning: { ...textSm, color: colors.danger },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 44,
    },
    timeValue: { ...textBase, fontFamily: fontFamily.body.semiBold, color: colors.accent },
    days: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    day: {
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: space[2],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radii.full,
      borderWidth: 1,
      borderColor: colors.borderDefault,
    },
    dayOn: { backgroundColor: colors.accent, borderColor: colors.accent },
    dayText: { ...textXs, fontFamily: fontFamily.body.semiBold, color: colors.textSecondary },
    dayTextOn: { color: colors.textInverse },
    footnote: { ...textSm, color: colors.textSecondary },
  });

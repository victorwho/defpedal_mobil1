import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { BottomNav, type TabKey } from '../src/design-system/organisms/BottomNav';
import { brandColors, gray } from '../src/design-system/tokens/colors';
import { fontFamily, textBase, textSm } from '../src/design-system/tokens/typography';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { useAppStore } from '../src/store/appStore';
import { useAuthSession } from '../src/providers/AuthSessionProvider';

const BIKE_TYPES = ['Road bike', 'City bike', 'Mountain bike', 'E-bike', 'Recumbent', 'Other'] as const;

const CYCLING_FREQUENCIES = [
  'Daily',
  'Several times a week',
  'Once a week',
  'A few times a month',
  'Once a month',
  'More rarely than once per month',
] as const;

const handleTabPress = (tab: TabKey) => {
  if (tab === 'map') router.replace('/route-planning');
  else if (tab === 'history') router.replace('/history');
  else if (tab === 'community') router.replace('/community');
};

type DropdownPickerProps = {
  label: string;
  value: string | null;
  options: readonly string[];
  onSelect: (value: string) => void;
  placeholder?: string;
};

const DropdownPicker = ({ label, value, options, onSelect, placeholder = 'Select...' }: DropdownPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable style={styles.settingRow} onPress={() => setOpen(true)}>
        <View style={styles.settingTextCol}>
          <Text style={styles.settingLabel}>{label}</Text>
          <Text style={styles.settingDescription}>{value ?? placeholder}</Text>
        </View>
        <Ionicons name="chevron-down" size={18} color={gray[400]} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{label}</Text>
            <ScrollView style={styles.optionsList} bounces={false}>
              {options.map((option) => (
                <Pressable
                  key={option}
                  style={[styles.optionRow, value === option && styles.optionRowSelected]}
                  onPress={() => {
                    onSelect(option);
                    setOpen(false);
                  }}
                >
                  <Text style={[styles.optionText, value === option && styles.optionTextSelected]}>
                    {option}
                  </Text>
                  {value === option ? (
                    <Ionicons name="checkmark" size={20} color={brandColors.accent} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

export default function ProfileScreen() {
  const { user } = useAuthSession();
  const shareTripsPublicly = useAppStore((state) => state.shareTripsPublicly);
  const setShareTripsPublicly = useAppStore((state) => state.setShareTripsPublicly);
  const bikeType = useAppStore((state) => state.bikeType);
  const setBikeType = useAppStore((state) => state.setBikeType);
  const cyclingFrequency = useAppStore((state) => state.cyclingFrequency);
  const setCyclingFrequency = useAppStore((state) => state.setCyclingFrequency);
  const avoidUnpaved = useAppStore((state) => state.avoidUnpaved);
  const setAvoidUnpaved = useAppStore((state) => state.setAvoidUnpaved);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <Screen title="Profile" eyebrow="Defensive Pedal" subtitle="Your account and settings">
          {user ? (
            <View style={styles.userCard}>
              <Ionicons name="person-circle-outline" size={48} color={brandColors.accent} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>{user.email ?? 'Rider'}</Text>
                <Text style={styles.userSub}>Signed in</Text>
              </View>
            </View>
          ) : (
            <Pressable style={styles.userCard} onPress={() => router.push('/auth')}>
              <Ionicons name="person-circle-outline" size={48} color={gray[500]} />
              <View style={styles.userInfo}>
                <Text style={styles.userName}>Guest</Text>
                <Text style={styles.userSub}>Tap to sign in</Text>
              </View>
              <Ionicons name="log-in-outline" size={24} color={brandColors.accent} />
            </Pressable>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About you</Text>

            <DropdownPicker
              label="Type of bike"
              value={bikeType}
              options={BIKE_TYPES}
              onSelect={setBikeType}
              placeholder="Select your bike type"
            />

            <DropdownPicker
              label="Cycling frequency"
              value={cyclingFrequency}
              options={CYCLING_FREQUENCIES}
              onSelect={setCyclingFrequency}
              placeholder="How often do you cycle?"
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Routing preferences</Text>

            <Pressable
              style={styles.settingRow}
              onPress={() => setAvoidUnpaved(!avoidUnpaved)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>Avoid unpaved roads</Text>
                <Text style={styles.settingDescription}>
                  {avoidUnpaved
                    ? 'Routes will stay on paved surfaces'
                    : 'Routes may include unpaved roads'}
                </Text>
              </View>
              <View style={[styles.toggle, avoidUnpaved && styles.toggleOn]}>
                <View style={[styles.toggleThumb, avoidUnpaved && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Privacy</Text>

            <Pressable
              style={styles.settingRow}
              onPress={() => setShareTripsPublicly(!shareTripsPublicly)}
            >
              <View style={styles.settingTextCol}>
                <Text style={styles.settingLabel}>Share trips publicly</Text>
                <Text style={styles.settingDescription}>
                  {shareTripsPublicly
                    ? 'Your rides are shared in the community feed'
                    : 'Your rides are private and not shared'}
                </Text>
              </View>
              <View style={[styles.toggle, shareTripsPublicly && styles.toggleOn]}>
                <View style={[styles.toggleThumb, shareTripsPublicly && styles.toggleThumbOn]} />
              </View>
            </Pressable>
          </View>
        </Screen>
      </View>
      <BottomNav activeTab="profile" onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brandColors.bgDeep },
  content: { flex: 1 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[4],
    padding: space[4],
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
  },
  userInfo: { flex: 1, gap: space[1] },
  userName: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 16,
  },
  userSub: {
    ...textSm,
    color: brandColors.textSecondary,
  },
  section: {
    gap: space[3],
  },
  sectionTitle: {
    ...textSm,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.accent,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
  },
  settingTextCol: { flex: 1, gap: space[1], marginRight: space[3] },
  settingLabel: {
    ...textBase,
    fontFamily: fontFamily.body.medium,
    color: brandColors.textPrimary,
  },
  settingDescription: {
    ...textSm,
    color: brandColors.textSecondary,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: gray[600],
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleOn: {
    backgroundColor: brandColors.accent,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
  },
  toggleThumbOn: {
    alignSelf: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space[6],
  },
  modalContent: {
    width: '100%',
    maxHeight: '70%',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: brandColors.borderDefault,
    backgroundColor: brandColors.bgDeep,
    padding: space[5],
    gap: space[4],
  },
  modalTitle: {
    ...textBase,
    fontFamily: fontFamily.heading.bold,
    color: brandColors.textPrimary,
    fontSize: 18,
    textAlign: 'center',
  },
  optionsList: {
    maxHeight: 300,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space[3] + space[0.5],
    paddingHorizontal: space[4],
    borderRadius: radii.lg,
  },
  optionRowSelected: {
    backgroundColor: 'rgba(250, 204, 21, 0.1)',
  },
  optionText: {
    ...textBase,
    fontFamily: fontFamily.body.regular,
    color: brandColors.textPrimary,
  },
  optionTextSelected: {
    fontFamily: fontFamily.body.medium,
    color: brandColors.accent,
  },
});

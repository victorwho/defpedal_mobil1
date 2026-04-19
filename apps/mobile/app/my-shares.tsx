import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '../src/components/Screen';
import { useTheme } from '../src/design-system/ThemeContext';
import { space } from '../src/design-system/tokens/spacing';
import { textBase } from '../src/design-system/tokens/typography';

// TODO(route-share slice future): list the user's active share codes + their
// conversion counts, with revoke/re-share CTAs. This stub exists so push
// notifications from slice 3 (`data.deepLink = '/my-shares'`) have a routable
// target — tapping the push opens this screen instead of 404'ing.
export default function MySharesScreen() {
  const { colors } = useTheme();

  return (
    <Screen headerVariant="back" title="Your shared routes">
      <View style={styles.container}>
        <Text style={[textBase, { color: colors.textSecondary }]}>
          We&apos;re working on a full view of your share history — conversions,
          XP earned, and badge progression. For now, this is a landing spot for
          &quot;Someone joined via your share!&quot; notifications.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: space[4],
    gap: space[3],
  },
});

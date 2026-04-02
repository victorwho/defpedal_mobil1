import { Stack } from 'expo-router';

import { darkTheme } from '../../src/design-system/tokens/colors';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: darkTheme.bgDeep },
        animation: 'slide_from_right',
      }}
    />
  );
}

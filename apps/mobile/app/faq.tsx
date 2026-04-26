import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { useTheme, type ThemeColors } from '../src/design-system';
import { SectionTitle } from '../src/design-system/atoms/SectionTitle';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textSm } from '../src/design-system/tokens/typography';
import { useT } from '../src/hooks/useTranslation';

// ---------------------------------------------------------------------------
// FAQ Data — 4 categorised sections
// ---------------------------------------------------------------------------

type FaqSection = {
  titleKey: string;
  icon: string;
  items: { question: string; answer: string }[];
};

const FAQ_SECTIONS: FaqSection[] = [
  {
    titleKey: 'Safety & Routing',
    icon: 'shield-checkmark-outline',
    items: [
      {
        question: 'What is Defensive Pedal?',
        answer:
          'Defensive Pedal is a cycling navigation app that prioritises rider safety. It calculates routes that avoid dangerous roads, busy intersections, and hazardous segments based on real-world risk data.',
      },
      {
        question: 'What should I check before every ride?',
        answer:
          'A 60-second check before you roll out.\n\nBike (ABC):\n\u2022 Air \u2014 squeeze both tyres, pump if soft\n\u2022 Brakes \u2014 squeeze each lever, the wheel should stop firmly\n\u2022 Chain \u2014 spin the cranks, check it isn\u2019t dry or rusty; quick-releases and bolts tight\n\nYou:\n\u2022 Helmet on, strap clipped\n\u2022 Front white light + rear red light on (always, even in daytime)\n\u2022 Bell works\n\u2022 Phone charged, mounted or securely pocketed\n\u2022 Visible clothing or reflectives if dusk or night\n\nRoute:\n\u2022 Destination set in Defensive Pedal and Safe route selected\n\u2022 Glance at the risk distribution and elevation \u2014 know what\u2019s coming\n\u2022 Check the weather widget for rain, wind, or poor air quality\n\u2022 Note any hazards reported on your route\n\nMind:\n\u2022 Hydrated, not riding hungry or exhausted\n\u2022 Voice guidance on so your eyes stay on the road\n\u2022 Plan your first turn before you push off\n\nIf anything fails the check, fix it before you ride \u2014 not at the first red light.',
      },
      {
        question: 'How does "Safe" routing differ from "Fast"?',
        answer:
          'Safe mode uses our custom OSRM server with a safety-weighted profile that avoids high-risk road segments. Fast mode uses standard Mapbox cycling directions optimised for shortest travel time.',
      },
      {
        question: 'How accurate is the risk data?',
        answer:
          'Risk scores are computed from OpenStreetMap road attributes (surface type, road class, speed limits, cycling infrastructure) combined with historical incident data where available. The model is updated regularly.',
      },
      {
        question: 'Which countries are supported?',
        answer:
          'Safe routing is currently available in Romania, Bulgaria, Hungary, and Serbia. Fast routing works worldwide via Mapbox.',
      },
      {
        question: 'What does "Avoid unpaved" do?',
        answer:
          'When active, the routing engine penalises gravel, dirt, and unpaved roads so your route stays on paved surfaces wherever possible.',
      },
      {
        question: 'How do I report a hazard?',
        answer:
          'During active navigation, tap the hazard report button on the HUD. You can report potholes, aggressive dogs, flooding, and other obstacles. Reports are shared with other riders. You can also long-press the map from the route planning screen to report hazards before you ride.',
      },
      {
        question: 'Can I use the app offline?',
        answer:
          'Offline map tiles can be downloaded from the Offline Maps screen in Settings. Route calculation still requires an internet connection.',
      },
      {
        question: 'How does voice guidance work?',
        answer:
          'When enabled, the app reads turn-by-turn instructions aloud during navigation. You can toggle it from the route planning screen or the navigation HUD.',
      },
    ],
  },
  {
    titleKey: 'Your Impact',
    icon: 'leaf-outline',
    items: [
      {
        question: 'What are Microlives?',
        answer:
          'Microlives are a science-based measure of life expectancy. 1 Microlife = 30 minutes of adult life expectancy. Every ride you take earns Microlives based on distance cycled, bike type, and air quality. The formula: 0.4 \u00D7 distance (km) \u00D7 vehicle modifier \u00D7 AQI modifier. Regular bikes earn more than e-bikes because of the higher physical effort.',
      },
      {
        question: 'How are community seconds calculated?',
        answer:
          'Every kilometre you cycle instead of driving prevents air pollution that would shorten the lives of people around you. We calculate this as 4.5 seconds of community life expectancy donated per km. These are aggregated city-wide to show collective impact.',
      },
      {
        question: 'What does the Time Bank show?',
        answer:
          'The Time Bank is your cumulative life expectancy earned from all your rides. It shows the total extra minutes, hours, or days of life you have gained through cycling. This number only goes up \u2014 every ride adds to it.',
      },
      {
        question: 'How is CO2 saved calculated?',
        answer:
          'We calculate CO2 savings by comparing your actual GPS cycling distance against the emissions a car would produce for the same trip. The formula uses the EU average of 120 g CO2/km. For example, a 10 km ride saves approximately 1.2 kg of CO2.',
      },
      {
        question: 'What are the equivalents shown after a ride?',
        answer:
          'After each ride, the impact summary shows your CO2 savings expressed as real-world equivalents \u2014 such as trees saved, phone charges, or kilometres of driving avoided. These help make abstract numbers tangible and motivating.',
      },
    ],
  },
  {
    titleKey: 'Progression & Rewards',
    icon: 'trophy-outline',
    items: [
      {
        question: 'How does the XP system work?',
        answer:
          'You earn Experience Points (XP) every time you complete a ride, earn a badge, or maintain a streak day. Ride XP scales with distance and includes multipliers for adverse weather and hazard reporting. XP accumulates towards your rider tier.',
      },
      {
        question: 'What are rider tiers?',
        answer:
          'There are 10 rider tiers from Kickstand (beginner) to Legend. Each tier requires more XP to reach. Your current tier is shown on your profile card and community feed posts. Reaching a new tier triggers a celebration overlay.',
      },
      {
        question: 'How do I earn badges?',
        answer:
          'Badges are awarded automatically for reaching milestones across 8 categories: distance, streaks, hazard reporting, community engagement, weather riding, time of day, exploration, and special achievements. Visit the Trophy Case in your profile to see all 137 badges and your progress.',
      },
      {
        question: 'How do streaks work?',
        answer:
          'Your streak counts consecutive days of qualifying activity. The day resets at 4:00 AM local time. If you miss a day, your streak resets to zero \u2014 unless you have a streak freeze available. Your longest streak is tracked separately.',
      },
      {
        question: 'What counts as a qualifying action for my streak?',
        answer:
          'Five actions count toward your daily streak: completing a ride, reporting a hazard, confirming or denying an existing hazard, answering the daily safety quiz, and sharing a ride to the community feed. You only need one per day to keep the streak alive.',
      },
    ],
  },
  {
    titleKey: 'Privacy & Data',
    icon: 'lock-closed-outline',
    items: [
      {
        question: 'What happens to my location data?',
        answer:
          'GPS breadcrumbs from your trips are uploaded to our servers so you can replay rides in your trip history, see your impact stats, and share routes to the community feed. Hazard reports include the exact coordinate where you tapped, plus your username so other riders can see who flagged it. If you share a trip to the feed, your username, route summary and full polyline are visible to other users.\n\nYou can delete your account at any time from Profile \u2192 Account \u2192 Delete account, which removes all of this data permanently.',
      },
      {
        question: 'How do I delete my account?',
        answer:
          'Open Profile, scroll to the Account section, and tap Delete account. You\'ll be asked to type DELETE to confirm. On confirmation, we permanently remove your trips, GPS history, hazard reports, comments, likes, badges, XP and profile from our servers. Community-visible content you posted (such as a hazard you flagged or a comment you wrote) is anonymised \u2014 the post stays so the community signal is preserved, but your name and account are gone.',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Accordion Item
// ---------------------------------------------------------------------------

const FaqItem = ({
  question,
  answer,
  expanded,
  onToggle,
  styles,
  colors,
}: {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
  styles: ReturnType<typeof createThemedStyles>;
  colors: ThemeColors;
}) => (
  <View style={styles.faqItem}>
    <Pressable
      style={styles.faqHeader}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={question}
    >
      <Text style={styles.faqQuestion}>{question}</Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
    {expanded ? (
      <View style={styles.faqBody}>
        <Text style={styles.faqAnswer}>{answer}</Text>
      </View>
    ) : null}
  </View>
);

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FaqScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createThemedStyles(colors), [colors]);
  const t = useT();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <Screen title={t('faq.title')} headerVariant="back">
      <Text style={styles.subtitle}>{t('faq.subtitle')}</Text>

      {FAQ_SECTIONS.map((section) => (
        <View key={section.titleKey} style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name={section.icon as any}
              size={20}
              color={colors.accent}
              accessible={false}
            />
            <SectionTitle variant="accent">{section.titleKey}</SectionTitle>
          </View>

          <View style={styles.faqList}>
            {section.items.map((item) => (
              <FaqItem
                key={item.question}
                question={item.question}
                answer={item.answer}
                expanded={expandedKey === item.question}
                onToggle={() =>
                  setExpandedKey(expandedKey === item.question ? null : item.question)
                }
                styles={styles}
                colors={colors}
              />
            ))}
          </View>
        </View>
      ))}
    </Screen>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createThemedStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    subtitle: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    sectionBlock: {
      gap: space[3],
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
    },
    faqList: {
      gap: space[2],
    },
    faqItem: {
      borderRadius: radii.xl,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      backgroundColor: colors.bgSecondary,
      overflow: 'hidden',
    },
    faqHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: space[4],
      paddingVertical: space[4],
      gap: space[3],
      minHeight: 56,
    },
    faqQuestion: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fontFamily.body.bold,
      fontSize: 15,
      lineHeight: 20,
    },
    faqBody: {
      paddingHorizontal: space[4],
      paddingBottom: space[4],
    },
    faqAnswer: {
      ...textSm,
      color: colors.textSecondary,
      lineHeight: 20,
    },
  });

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { darkTheme, gray } from '../src/design-system/tokens/colors';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, text2xl, textSm, textBase } from '../src/design-system/tokens/typography';

// ---------------------------------------------------------------------------
// FAQ Data
// ---------------------------------------------------------------------------

const FAQ_ITEMS: { question: string; answer: string }[] = [
  {
    question: 'What is Defensive Pedal?',
    answer:
      'Defensive Pedal is a cycling navigation app that prioritises rider safety. It calculates routes that avoid dangerous roads, busy intersections, and hazardous segments based on real-world risk data.',
  },
  {
    question: 'How does "Safe" routing differ from "Fast"?',
    answer:
      'Safe mode uses our custom OSRM server with a safety-weighted profile that avoids high-risk road segments. Fast mode uses standard Mapbox cycling directions optimised for shortest travel time.',
  },
  {
    question: 'Which countries are supported?',
    answer:
      'Safe routing is currently available in Romania, Bulgaria, Hungary, and Serbia. Fast routing works worldwide via Mapbox.',
  },
  {
    question: 'How accurate is the risk data?',
    answer:
      'Risk scores are computed from OpenStreetMap road attributes (surface type, road class, speed limits, cycling infrastructure) combined with historical incident data where available. The model is updated regularly.',
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
  {
    question: 'What does "Avoid unpaved" do?',
    answer:
      'When active, the routing engine penalises gravel, dirt, and unpaved roads so your route stays on paved surfaces wherever possible.',
  },
  {
    question: 'How do I report a hazard?',
    answer:
      'During active navigation, tap the hazard report button on the HUD. You can report potholes, construction, flooding, and other obstacles. Reports are shared with other riders.',
  },
  {
    question: 'Is my location data shared?',
    answer:
      'Your location is only used locally for navigation and route planning. We do not store or share your GPS tracks. Hazard reports are anonymised.',
  },
  {
    question: 'What are Microlives?',
    answer:
      'Microlives are a science-based measure of life expectancy. 1 Microlife = 30 minutes of adult life expectancy. Every ride you take earns Microlives based on distance cycled, bike type, and air quality. The formula: 0.4 × distance (km) × vehicle modifier × AQI modifier. Acoustic bikes earn more than e-bikes because of the higher physical effort.',
  },
  {
    question: 'How are community seconds calculated?',
    answer:
      'Every kilometre you cycle instead of driving prevents air pollution that would shorten the lives of people around you. We calculate this as 4.5 seconds of community life expectancy donated per km. These are aggregated city-wide to show collective impact.',
  },
  {
    question: 'What does the Time Bank show?',
    answer:
      'The Time Bank is your cumulative life expectancy earned from all your rides. It shows the total extra minutes, hours, or days of life you have gained through cycling. This number only goes up — every ride adds to it.',
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
}: {
  question: string;
  answer: string;
  expanded: boolean;
  onToggle: () => void;
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
        color={darkTheme.textSecondary}
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
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={24} color={darkTheme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>FAQ</Text>
        <View style={styles.backButton} />
      </View>

      {/* Content */}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Frequently asked questions about Defensive Pedal.
        </Text>

        <View style={styles.faqList}>
          {FAQ_ITEMS.map((item, index) => (
            <FaqItem
              key={index}
              question={item.question}
              answer={item.answer}
              expanded={expandedIndex === index}
              onToggle={() =>
                setExpandedIndex(expandedIndex === index ? null : index)
              }
            />
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkTheme.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...text2xl,
    color: darkTheme.textPrimary,
    letterSpacing: -0.5,
  },
  content: {
    paddingHorizontal: space[4],
    paddingBottom: space[8],
    gap: space[4],
  },
  subtitle: {
    ...textSm,
    color: darkTheme.textSecondary,
    lineHeight: 20,
  },
  faqList: {
    gap: space[2],
  },
  faqItem: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: darkTheme.borderDefault,
    backgroundColor: darkTheme.bgSecondary,
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
    color: darkTheme.textPrimary,
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
    color: darkTheme.textSecondary,
    lineHeight: 20,
  },
});

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { Screen } from '../src/components/Screen';
import { FAQ_SECTION_ICONS, getFaqSections } from '../src/content/faq';
import { useTheme, type ThemeColors } from '../src/design-system';
import { SectionTitle } from '../src/design-system/atoms/SectionTitle';
import { space } from '../src/design-system/tokens/spacing';
import { radii } from '../src/design-system/tokens/radii';
import { fontFamily, textSm } from '../src/design-system/tokens/typography';
import { useLocale, useT } from '../src/hooks/useTranslation';

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
  const { locale } = useLocale();
  const sections = useMemo(() => getFaqSections(locale), [locale]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  return (
    <Screen title={t('faq.title')} headerVariant="back">
      <Text style={styles.subtitle}>{t('faq.subtitle')}</Text>

      {sections.map((section) => (
        <View key={section.id} style={styles.sectionBlock}>
          <View style={styles.sectionHeader}>
            <Ionicons
              name={FAQ_SECTION_ICONS[section.id] as any}
              size={20}
              color={colors.accent}
              accessible={false}
            />
            <SectionTitle variant="accent">{section.title}</SectionTitle>
          </View>

          <View style={styles.faqList}>
            {section.items.map((item) => (
              <FaqItem
                key={item.id}
                question={item.question}
                answer={item.answer}
                expanded={expandedKey === item.id}
                onToggle={() => setExpandedKey(expandedKey === item.id ? null : item.id)}
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

/**
 * ActivityCommentSheet — bottom-anchored sheet for reading and posting
 * comments on any activity-feed item.
 *
 * Replaces the per-item dedicated trip-detail screen as the entry point
 * for commenting. Works for ALL activity types (rides, hazards, badges,
 * tier-ups, route-share signups) because comments live on `activity_feed`,
 * not on `trip_shares`. Lifting the sheet inline removes:
 *   - the GPS-keyed feed cache mismatch that broke the dedicated screen
 *   - the "trip is no longer available" state for non-ride activities
 *
 * Dismissal:
 *   - Backdrop tap
 *   - Swipe down past threshold (mirrors HazardDetailSheet)
 *   - Android hardware back / screen reader `accessibilityEscape`
 *
 * Optimistic update — the typed comment is pushed onto the cache list
 * immediately by `usePostActivityComment` and rolled back on server error.
 * The user sees their comment without waiting for a refetch.
 */
import type { FeedComment } from '@defensivepedal/core';
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../ThemeContext';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  useActivityComments,
  usePostActivityComment,
} from '../../hooks/useActivityFeed';
import { useProfile } from '../../hooks/useFeed';
import { useT } from '../../hooks/useTranslation';
import { useAuthSessionOptional } from '../../providers/AuthSessionProvider';
import { radii } from '../tokens/radii';
import { space } from '../tokens/spacing';
import { fontFamily, textBase, textSm, textXs } from '../tokens/typography';
import { duration as dur, easing } from '../tokens/motion';
import { zIndex } from '../tokens/zIndex';

const SWIPE_DISMISS_DY = 120;
const SWIPE_DISMISS_VY = 0.6;
const COMMENT_MAX_CHARS = 500;

export interface ActivityCommentSheetProps {
  /** When non-null, the sheet is open for the given activity id. */
  activityId: string | null;
  onClose: () => void;
  /** Optional context shown in the sheet header. */
  contextLabel?: string;
}

const formatRelativeTime = (iso: string, nowMs: number): string => {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffSec = Math.max(0, Math.round((nowMs - ts) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString();
};

export const ActivityCommentSheet: React.FC<ActivityCommentSheetProps> = ({
  activityId,
  onClose,
  contextLabel,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const t = useT();
  const { height: windowHeight } = useWindowDimensions();
  // Explicit pixel height so the inner FlatList has a bounded parent and
  // can scroll. Percentage heights don't propagate through Modal +
  // Pressable + KeyboardAvoidingView reliably on Android.
  const sheetHeight = Math.round(windowHeight * 0.85);

  const visible = activityId !== null;

  const commentsQuery = useActivityComments(activityId);
  const postComment = usePostActivityComment();
  const profileQuery = useProfile();
  const auth = useAuthSessionOptional();
  const currentUserId = auth?.user?.id ?? null;

  const [draft, setDraft] = useState('');
  const [now, setNow] = useState(() => Date.now());

  // Refresh relative timestamps every minute while the sheet is open.
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [visible]);

  // Reset the draft whenever the sheet opens for a new activity.
  useEffect(() => {
    if (visible) setDraft('');
  }, [visible, activityId]);

  // Swipe-to-dismiss + slide-in animation.
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      translateY.setValue(0);
      opacity.setValue(0);
      return;
    }
    if (reducedMotion) {
      translateY.setValue(0);
      opacity.setValue(1);
      return;
    }
    translateY.setValue(40);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: 0,
        duration: dur.normal,
        easing: easing.out,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: dur.normal,
        easing: easing.out,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, reducedMotion, translateY, opacity]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        gestureState.dy > 8 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_DISMISS_DY || gestureState.vy > SWIPE_DISMISS_VY) {
          onClose();
        } else {
          Animated.timing(translateY, {
            toValue: 0,
            duration: dur.fast,
            easing: easing.out,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const trimmed = draft.trim();
  const canSubmit = trimmed.length > 0 && !postComment.isPending && activityId !== null;

  const handleSubmit = () => {
    if (!canSubmit || activityId === null) return;
    const profile = profileQuery.data;
    postComment.mutate(
      {
        activityId,
        body: trimmed.slice(0, COMMENT_MAX_CHARS),
        optimisticAuthor: {
          id: profile?.id ?? currentUserId ?? '',
          displayName: profile?.displayName ?? 'You',
          avatarUrl: profile?.avatarUrl ?? null,
        },
      },
      {
        onSuccess: () => setDraft(''),
        onError: (err) => {
          const message = err instanceof Error ? err.message : 'Could not post comment.';
          Alert.alert('Comment failed', message);
        },
      },
    );
  };

  const renderComment = ({ item }: { item: FeedComment }) => (
    <View style={[styles(colors).commentRow, { borderBottomColor: colors.borderDefault }]}>
      <View style={styles(colors).commentHeader}>
        <Text style={[styles(colors).commentAuthor, { color: colors.textPrimary }]}>
          {item.user.displayName}
        </Text>
        <Text style={[styles(colors).commentTimestamp, { color: colors.textSecondary }]}>
          {formatRelativeTime(item.createdAt, now)}
        </Text>
      </View>
      <Text style={[styles(colors).commentBody, { color: colors.textPrimary }]}>
        {item.body}
      </Text>
    </View>
  );

  const comments = commentsQuery.data?.comments ?? [];
  const isLoadingComments = commentsQuery.isLoading && comments.length === 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      {/* Backdrop: full-screen absolute layer that ONLY handles tap-to-close.
          Kept off the layout chain of the sheet so the sheet's pixel height
          is unambiguous (and FlatList can compute its own bounded space). */}
      <View style={styles(colors).root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel={t('feedCard.dismissComments')}
          onPress={onClose}
        />
        <KeyboardAvoidingView
          style={styles(colors).bottomDock}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Animated.View
            style={[
              styles(colors).sheet,
              {
                backgroundColor: colors.bgPrimary,
                paddingBottom: insets.bottom + space[3],
                height: sheetHeight,
                transform: [{ translateY }],
                opacity,
              },
            ]}
            onAccessibilityEscape={onClose}
          >
              <View style={styles(colors).handleArea} {...panResponder.panHandlers}>
                <View style={[styles(colors).handle, { backgroundColor: colors.borderDefault }]} />
                <View style={styles(colors).header}>
                  <Text
                    style={[styles(colors).title, { color: colors.textPrimary }]}
                    accessibilityRole="header"
                    numberOfLines={1}
                  >
                    {contextLabel ?? t('feedCard.commentsTitle')}
                  </Text>
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    accessibilityLabel={t('feedCard.dismissComments')}
                    hitSlop={12}
                  >
                    <Ionicons name="close" size={22} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>

              {isLoadingComments ? (
                <View style={styles(colors).loadingBlock}>
                  <ActivityIndicator color={colors.accent} />
                </View>
              ) : (
                <FlatList
                  data={comments}
                  keyExtractor={(c) => c.id}
                  renderItem={renderComment}
                  contentContainerStyle={styles(colors).listContent}
                  ListEmptyComponent={
                    <Text style={[styles(colors).empty, { color: colors.textSecondary }]}>
                      {t('feedCard.noCommentsYet')}
                    </Text>
                  }
                  keyboardShouldPersistTaps="handled"
                  style={styles(colors).list}
                />
              )}

              <View
                style={[
                  styles(colors).inputBar,
                  { borderTopColor: colors.borderDefault },
                ]}
              >
                <TextInput
                  style={[
                    styles(colors).input,
                    { color: colors.textPrimary, backgroundColor: colors.bgSecondary },
                  ]}
                  placeholder={t('feedCard.commentPlaceholder')}
                  placeholderTextColor={colors.textSecondary}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  maxLength={COMMENT_MAX_CHARS}
                  editable={!postComment.isPending}
                  accessibilityLabel={t('feedCard.commentPlaceholder')}
                />
                <Pressable
                  style={[
                    styles(colors).sendButton,
                    {
                      backgroundColor: canSubmit ? colors.accent : colors.bgSecondary,
                    },
                  ]}
                  disabled={!canSubmit}
                  onPress={handleSubmit}
                  accessibilityRole="button"
                  accessibilityLabel={t('feedCard.sendComment')}
                  hitSlop={6}
                >
                  {postComment.isPending ? (
                    <ActivityIndicator size="small" color={colors.bgDeep} />
                  ) : (
                    <Ionicons
                      name="arrow-up"
                      size={20}
                      color={canSubmit ? colors.bgDeep : colors.textSecondary}
                    />
                  )}
                </Pressable>
              </View>
            </Animated.View>
          </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = (colors: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      zIndex: zIndex.modal,
    },
    bottomDock: {
      width: '100%',
    },
    sheet: {
      borderTopLeftRadius: radii.xl,
      borderTopRightRadius: radii.xl,
      // Pixel height is set inline from useWindowDimensions so the inner
      // FlatList has a bounded parent and can scroll.
      overflow: 'hidden',
    },
    handleArea: {
      paddingHorizontal: space[4],
      paddingTop: space[2],
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      opacity: 0.6,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: space[3],
      paddingBottom: space[3],
    },
    title: {
      ...textBase,
      flex: 1,
      marginRight: space[3],
      fontFamily: fontFamily.heading.bold,
    },
    list: {
      // Take all the room between header and input bar so the FlatList's
      // built-in ScrollView has a bounded height and can actually scroll.
      flex: 1,
    },
    listContent: {
      paddingHorizontal: space[4],
      paddingBottom: space[3],
    },
    loadingBlock: {
      paddingVertical: space[6],
      alignItems: 'center',
    },
    empty: {
      ...textSm,
      textAlign: 'center',
      paddingVertical: space[6],
    },
    commentRow: {
      paddingVertical: space[3],
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    commentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: space[1],
    },
    commentAuthor: {
      ...textSm,
      fontFamily: fontFamily.body.semiBold,
    },
    commentTimestamp: {
      ...textXs,
    },
    commentBody: {
      ...textSm,
      lineHeight: 20,
    },
    inputBar: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: space[4],
      paddingTop: space[3],
      gap: space[2],
      borderTopWidth: StyleSheet.hairlineWidth,
    },
    input: {
      ...textBase,
      flex: 1,
      maxHeight: 120,
      borderRadius: radii.lg,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      fontFamily: fontFamily.body.regular,
    },
    sendButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });

import { createClient } from '@supabase/supabase-js';
import { sendPushNotification } from './push';

type NotificationCategory = 'weather' | 'hazard' | 'community' | 'system';

interface NotificationPayload {
  readonly title: string;
  readonly body: string;
  readonly data?: Record<string, unknown>;
}

export interface UserPrefs {
  notify_weather: boolean;
  notify_hazard: boolean;
  notify_community: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
  quiet_hours_timezone: string | null;
}

const getSupabaseAdmin = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase credentials for notifications');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped DB schema
  return createClient<any>(url, key);
};

const categoryToField: Record<NotificationCategory, keyof UserPrefs | null> = {
  weather: 'notify_weather',
  hazard: 'notify_hazard',
  community: 'notify_community',
  system: null, // system notifications always go through
};

/**
 * Check if the current time falls within the user's quiet hours.
 */
export const isInQuietHours = (prefs: UserPrefs): boolean => {
  const start = prefs.quiet_hours_start;
  const end = prefs.quiet_hours_end;
  if (!start || !end) return false;

  // Get current time in user's timezone
  const tz = prefs.quiet_hours_timezone ?? 'UTC';
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
  });
  const currentTime = formatter.format(now); // "HH:MM"

  // Handle overnight quiet hours (e.g., 22:00 → 07:00)
  if (start > end) {
    return currentTime >= start || currentTime < end;
  }
  return currentTime >= start && currentTime < end;
};

const logNotification = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  category: NotificationCategory,
  payload: NotificationPayload,
  status: 'sent' | 'failed' | 'suppressed',
  suppressionReason?: string,
  ticketId?: string,
) => {
  try {
    await supabase.from('notification_log').insert({
      user_id: userId,
      category,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? null,
      status,
      suppression_reason: suppressionReason ?? null,
      expo_ticket_id: ticketId ?? null,
    });
  } catch {
    // Don't fail the notification flow for logging errors
  }
};

export type NotificationPriority = 'high' | 'normal';

/**
 * Check whether the user has already received a notification in the last 24 h.
 * Uses a rolling window so the limit is timezone-agnostic.
 */
export const isUnderDailyBudget = async (
  userId: string,
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<boolean> => {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count, error } = await supabase
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'sent')
    .gte('created_at', twentyFourHoursAgo);

  if (error) return true; // fail open — don't block on logging errors
  return (count ?? 0) < 1;
};

/**
 * Send a push notification to a specific user, respecting their
 * category preferences, quiet hours, and daily budget.
 *
 * `priority: 'high'` bypasses the daily budget (used for streak
 * protection — the most time-sensitive notification).
 */
export const dispatchNotification = async (
  userId: string,
  category: NotificationCategory,
  payload: NotificationPayload,
  options?: { priority?: NotificationPriority },
): Promise<void> => {
  const supabase = getSupabaseAdmin();
  const priority = options?.priority ?? 'normal';

  // Load user preferences
  const { data: prefs } = await supabase
    .from('profiles')
    .select('notify_weather, notify_hazard, notify_community, quiet_hours_start, quiet_hours_end, quiet_hours_timezone')
    .eq('id', userId)
    .single();

  if (prefs) {
    // Check category preference
    const field = categoryToField[category];
    if (field && prefs[field] === false) {
      await logNotification(supabase, userId, category, payload, 'suppressed', 'category_disabled');
      return;
    }

    // Check quiet hours
    if (isInQuietHours(prefs as UserPrefs)) {
      await logNotification(supabase, userId, category, payload, 'suppressed', 'quiet_hours');
      return;
    }
  }

  // Daily budget: strict 1 notification per 24 h (high priority bypasses)
  if (priority !== 'high' && !(await isUnderDailyBudget(userId, supabase))) {
    await logNotification(supabase, userId, category, payload, 'suppressed', 'daily_budget');
    return;
  }

  // Load push tokens
  const { data: tokens } = await supabase
    .from('push_tokens')
    .select('expo_push_token')
    .eq('user_id', userId);

  if (!tokens || tokens.length === 0) {
    await logNotification(supabase, userId, category, payload, 'failed');
    return;
  }

  // Send to all devices
  for (const token of tokens) {
    const ticketId = await sendPushNotification({
      to: token.expo_push_token,
      title: payload.title,
      body: payload.body,
      data: { ...payload.data, category },
      categoryId: category,
    });

    await logNotification(
      supabase,
      userId,
      category,
      payload,
      ticketId ? 'sent' : 'failed',
      undefined,
      ticketId ?? undefined,
    );
  }
};

/**
 * Broadcast a notification to all users who have the category enabled
 * and are not in quiet hours.
 */
export const broadcastNotification = async (
  category: NotificationCategory,
  payload: NotificationPayload,
): Promise<number> => {
  const supabase = getSupabaseAdmin();
  const field = categoryToField[category];

  let query = supabase.from('profiles').select('id');
  if (field) {
    query = query.eq(field, true);
  }

  const { data: users } = await query;
  if (!users) return 0;

  let sentCount = 0;
  for (const user of users) {
    try {
      await dispatchNotification(user.id, category, payload);
      sentCount++;
    } catch {
      // Continue to next user on failure
    }
  }

  return sentCount;
};

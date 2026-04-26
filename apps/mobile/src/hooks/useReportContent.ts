import { useMutation } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

export type ReportTargetType = 'comment' | 'hazard' | 'trip_share' | 'profile';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'illegal'
  | 'other';

export type ReportPayload = {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
};

/**
 * UGC moderation: submit a report against a comment / hazard / trip share /
 * profile. Server enforces uniqueness per (reporter, target) — duplicate
 * reports return 409 which we surface as a friendly error.
 */
export const useReportContent = () =>
  useMutation({
    mutationFn: (payload: ReportPayload) => mobileApi.reportContent(payload),
  });

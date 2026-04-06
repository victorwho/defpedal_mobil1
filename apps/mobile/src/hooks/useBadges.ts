import type { BadgeResponse } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';

const BADGES_KEY = 'badges';

export const useBadges = () =>
  useQuery<BadgeResponse>({
    queryKey: [BADGES_KEY],
    queryFn: () => mobileApi.fetchBadges(),
    staleTime: 5 * 60_000,
  });

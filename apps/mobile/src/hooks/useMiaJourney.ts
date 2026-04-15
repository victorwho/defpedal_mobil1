import type { MiaJourneyLevel, MiaJourneyState, MiaJourneyStatus } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';

import { mobileApi } from '../lib/api';
import { useAppStore } from '../store/appStore';

/**
 * Fetches the Mia persona journey state from the server
 * and syncs it into Zustand for offline access.
 *
 * Only enabled when the local persona is 'mia'.
 */
export function useMiaJourney() {
  const persona = useAppStore((s) => s.persona);

  return useQuery<MiaJourneyState>({
    queryKey: ['mia-journey', persona],
    queryFn: async () => {
      const data = await mobileApi.getMiaJourney();

      // Sync server state into Zustand for offline access
      const store = useAppStore.getState();
      if (data.persona !== store.persona) {
        useAppStore.setState({ persona: data.persona });
      }
      if (data.level !== store.miaJourneyLevel) {
        useAppStore.setState({ miaJourneyLevel: data.level as MiaJourneyLevel });
      }
      if (data.status !== store.miaJourneyStatus) {
        useAppStore.setState({ miaJourneyStatus: data.status as MiaJourneyStatus | null });
      }

      return data;
    },
    enabled: persona === 'mia',
    staleTime: 60_000,
  });
}

import type {
  CitySuggestionRequest,
  CitySuggestionResponse,
  Coordinate,
  NearbyCitySuggestion,
} from '@defensivepedal/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { mobileApi } from '../lib/api';
import { useConnectivity } from '../providers/ConnectivityMonitor';
import { useAppStore } from '../store/appStore';

const PREVIEW_LENGTH = 60;

const truncate = (body: string, limit = PREVIEW_LENGTH): string =>
  body.length <= limit ? body : `${body.slice(0, limit - 1).trimEnd()}…`;

const synthesizeOfflineResponse = (
  submittedAt: string,
): CitySuggestionResponse => ({
  id: `client-city-suggestion-${submittedAt}`,
  createdAt: submittedAt,
  status: 'open',
});

export interface UseSubmitCitySuggestionResult {
  readonly submit: (input: {
    readonly coordinate: Coordinate;
    readonly body: string;
    readonly routeContext?: CitySuggestionRequest['routeContext'];
  }) => Promise<CitySuggestionResponse>;
  readonly isSubmitting: boolean;
  readonly toastMessage: string | null;
  readonly consumeToast: () => void;
}

// Always enqueues via the offline queue first; the sync manager drains writes
// to the server when connectivity returns. This mirrors the hazard-vote
// approach: the user always sees a confirmation, never a network spinner.
export const useSubmitCitySuggestion = (): UseSubmitCitySuggestionResult => {
  const queryClient = useQueryClient();
  const { isOnline } = useConnectivity();
  const enqueueMutation = useAppStore((state) => state.enqueueMutation);
  const addRecentCitySuggestion = useAppStore(
    (state) => state.addRecentCitySuggestion,
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const mutation = useMutation<
    CitySuggestionResponse,
    Error,
    {
      coordinate: Coordinate;
      body: string;
      routeContext?: CitySuggestionRequest['routeContext'];
    }
  >({
    mutationFn: async ({ coordinate, body, routeContext }) => {
      const submittedAt = new Date().toISOString();
      const payload: CitySuggestionRequest = {
        coordinate,
        body,
        submittedAt,
        source: 'route_preview',
        routeContext: routeContext ?? null,
      };

      // Always enqueue first — drain handles the wire. Offline-safe by design.
      enqueueMutation('city_suggestion', payload);
      addRecentCitySuggestion({
        coordinate,
        submittedAt,
        suggestionPreview: truncate(body),
      });

      return synthesizeOfflineResponse(submittedAt);
    },
    onSuccess: () => {
      // No display surface in v1, but the nearby query is wired — keep cache
      // consistent for v2.
      queryClient.invalidateQueries({ queryKey: ['city-suggestions', 'nearby'] });
    },
  });

  const submit = useCallback<UseSubmitCitySuggestionResult['submit']>(
    async (input) => {
      const result = await mutation.mutateAsync(input);
      setToastMessage(isOnline ? 'success' : 'queued');
      return result;
    },
    [mutation, isOnline],
  );

  const consumeToast = useCallback(() => {
    setToastMessage(null);
  }, []);

  return useMemo(
    () => ({
      submit,
      isSubmitting: mutation.isPending,
      toastMessage,
      consumeToast,
    }),
    [submit, mutation.isPending, toastMessage, consumeToast],
  );
};

// Stub read hook. v1 stays disabled (call site is commented out in the
// route-preview integration). Wired so that when a display surface ships,
// the query key + URL are stable.
export const useCitySuggestionsNearby = (
  coordinate: Coordinate | null,
  radiusMeters = 1000,
) =>
  useQuery<NearbyCitySuggestion[], Error>({
    queryKey: [
      'city-suggestions',
      'nearby',
      coordinate?.lat ?? null,
      coordinate?.lon ?? null,
      radiusMeters,
    ],
    queryFn: () => {
      if (!coordinate) return Promise.resolve<NearbyCitySuggestion[]>([]);
      return mobileApi.getNearbyCitySuggestions(
        coordinate.lat,
        coordinate.lon,
        radiusMeters,
      );
    },
    enabled:
      coordinate != null && coordinate.lat !== 0 && coordinate.lon !== 0,
    staleTime: 60_000,
  });

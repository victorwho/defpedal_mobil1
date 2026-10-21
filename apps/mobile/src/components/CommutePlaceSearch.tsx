import type { AutocompleteSuggestion, ResolvedSuggestion } from '@defensivepedal/core';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';

import { SearchBar } from '../design-system/molecules/SearchBar';
import { useT } from '../hooks/useTranslation';
import { useUnits } from '../hooks/useUnits';
import { mobileApi } from '../lib/api';
import { mobileEnv } from '../lib/env';
import { resolveSuggestion } from '../lib/mapbox-search';
import { useAppStore } from '../store/appStore';

type CommutePlaceSearchProps = {
  label: string;
  onPicked: (place: ResolvedSuggestion) => void;
  onFailed: () => void;
};

/**
 * Address search that only picks a place (no routing). Same autocomplete
 * call as route planning, biased toward where the rider last searched from.
 */
export const CommutePlaceSearch = ({ label, onPicked, onFailed }: CommutePlaceSearchProps) => {
  const t = useT();
  const units = useUnits();
  const routeRequest = useAppStore((s) => s.routeRequest);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const hasOrigin = routeRequest.origin.lat !== 0 || routeRequest.origin.lon !== 0;

  const autocomplete = useQuery({
    queryKey: ['autocomplete', 'commute-place', deferred, routeRequest.locale, routeRequest.countryHint, units],
    queryFn: () =>
      mobileApi.autocomplete(
        {
          query: deferred,
          proximity: hasOrigin ? routeRequest.origin : undefined,
          locale: routeRequest.locale,
          countryHint: routeRequest.countryHint,
          limit: 5,
        },
        units,
      ),
    enabled: Boolean(mobileEnv.mapboxPublicToken) && deferred.length >= 2,
  });

  const pick = async (suggestion: AutocompleteSuggestion) => {
    const resolved = await resolveSuggestion(suggestion).catch(() => null);
    if (resolved) onPicked(resolved);
    else onFailed();
  };

  return (
    <SearchBar
      label={label}
      value={query}
      placeholder={t('commuteScreen.searchPlaceholder')}
      active
      isLoading={autocomplete.isFetching}
      errorMessage={autocomplete.isError ? t('commuteScreen.searchFailed') : null}
      suggestions={autocomplete.data?.suggestions ?? []}
      onChangeText={setQuery}
      onFocus={() => undefined}
      onClear={() => setQuery('')}
      onSelectSuggestion={(s) => void pick(s)}
    />
  );
};

// @vitest-environment happy-dom
/**
 * SearchBar Molecule — Unit Tests
 *
 * Tests rendering, suggestions, recent destinations, and callbacks.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SearchBarProps } from '../SearchBar';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark' as const,
    colors: {
      accent: '#FACC15',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
      textMuted: '#8B9198',
      bgPrimary: '#1F2937',
      bgSecondary: '#374151',
      bgTertiary: '#4B5563',
      borderDefault: 'rgba(255,255,255,0.08)',
      danger: '#EF4444',
    },
  }),
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}`, ...props }),
    ),
  };
});

vi.mock('../../atoms/TextInput', () => {
  const React = require('react');
  return {
    TextInput: (props: Record<string, unknown>) =>
      React.createElement('input', {
        'data-testid': 'search-input',
        value: props.value,
        onChange: (e: { target: { value: string } }) =>
          (props.onChangeText as (v: string) => void)?.(e.target.value),
        onFocus: props.onFocus,
        placeholder: props.placeholder,
      }),
  };
});

vi.mock('../../atoms/Spinner', () => {
  const React = require('react');
  return {
    Spinner: () => React.createElement('span', { 'data-testid': 'spinner' }, 'Loading...'),
  };
});

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () => (key: string) => {
    const translations: Record<string, string> = {
      'search.recent': 'Recent',
      'search.searching': 'Searching...',
      'search.noMatches': 'No results found',
    };
    return translations[key] ?? key;
  },
}));

const { SearchBar } = await import('../SearchBar');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SearchBar', () => {
  const defaultProps: SearchBarProps = {
    label: 'Destination',
    value: '',
    placeholder: 'Where to?',
    onChangeText: vi.fn(),
    onFocus: vi.fn(),
    onClear: vi.fn(),
    onSelectSuggestion: vi.fn(),
  };

  describe('rendering', () => {
    it('renders label', () => {
      render(<SearchBar {...defaultProps} />);
      expect(screen.getByText('Destination')).toBeTruthy();
    });

    it('renders the text input', () => {
      render(<SearchBar {...defaultProps} />);
      expect(screen.getByTestId('search-input')).toBeTruthy();
    });
  });

  describe('clear button', () => {
    it('shows clear button when value is non-empty', () => {
      render(<SearchBar {...defaultProps} value="Bucharest" />);
      expect(screen.getByLabelText('Clear search')).toBeTruthy();
    });

    it('does not show clear button when value is empty', () => {
      render(<SearchBar {...defaultProps} value="" />);
      expect(screen.queryByLabelText('Clear search')).toBeNull();
    });

    it('calls onClear when clear button is pressed', () => {
      const onClear = vi.fn();
      render(<SearchBar {...defaultProps} value="test" onClear={onClear} />);
      fireEvent.click(screen.getByLabelText('Clear search'));
      expect(onClear).toHaveBeenCalledTimes(1);
    });
  });

  describe('suggestions dropdown', () => {
    it('shows suggestions when active with results', () => {
      const suggestions = [
        {
          id: '1',
          label: 'Piata Victoriei',
          primaryText: 'Piata Victoriei',
          secondaryText: 'Bucharest',
          coordinates: { lat: 44.45, lon: 26.08 },
        },
      ];
      render(
        <SearchBar
          {...defaultProps}
          active
          value="Piata"
          suggestions={suggestions}
        />,
      );
      expect(screen.getByText('Piata Victoriei')).toBeTruthy();
    });

    it('shows loading spinner when isLoading', () => {
      render(
        <SearchBar
          {...defaultProps}
          active
          value="test"
          isLoading
        />,
      );
      expect(screen.getByTestId('spinner')).toBeTruthy();
    });

    it('shows error message when provided', () => {
      render(
        <SearchBar
          {...defaultProps}
          active
          value="test"
          errorMessage="Network error"
        />,
      );
      expect(screen.getByText('Network error')).toBeTruthy();
    });

    it('shows no results message when search yields empty', () => {
      render(
        <SearchBar
          {...defaultProps}
          active
          value="xyznonexistent"
          suggestions={[]}
        />,
      );
      expect(screen.getByText('No results found')).toBeTruthy();
    });

    it('calls onSelectSuggestion when a suggestion is pressed', () => {
      const onSelectSuggestion = vi.fn();
      const suggestions = [
        {
          id: '1',
          label: 'Piata Victoriei',
          primaryText: 'Piata Victoriei',
          coordinates: { lat: 44.45, lon: 26.08 },
        },
      ];
      render(
        <SearchBar
          {...defaultProps}
          active
          value="Piata"
          suggestions={suggestions}
          onSelectSuggestion={onSelectSuggestion}
        />,
      );
      fireEvent.click(screen.getByLabelText('Select Piata Victoriei'));
      expect(onSelectSuggestion).toHaveBeenCalledWith(suggestions[0]);
    });
  });

  describe('recent destinations', () => {
    it('shows recent destinations when active with empty value', () => {
      const recentDestinations = [
        {
          id: 'r1',
          label: 'Home',
          primaryText: 'Home',
          secondaryText: 'Str. Victoriei 10',
          coordinates: { lat: 44.42, lon: 26.10 },
          selectedAt: '2026-04-01T10:00:00Z',
        },
      ];
      render(
        <SearchBar
          {...defaultProps}
          active
          value=""
          recentDestinations={recentDestinations}
        />,
      );
      expect(screen.getByText('Recent')).toBeTruthy();
      expect(screen.getByText('Home')).toBeTruthy();
    });
  });

  describe('status text', () => {
    it('shows status text when provided', () => {
      render(<SearchBar {...defaultProps} statusText="3 results" />);
      expect(screen.getByText('3 results')).toBeTruthy();
    });
  });
});

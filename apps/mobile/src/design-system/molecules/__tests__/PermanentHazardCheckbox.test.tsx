// @vitest-environment happy-dom
/**
 * PermanentHazardCheckbox Molecule — Unit Tests
 *
 * Covers: checked/unchecked glyph, toggle callback, a11y contract, disabled.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../hooks/useHaptics', () => ({
  useHaptics: () => ({
    confirm: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    celebration: vi.fn(),
    destructiveConfirm: vi.fn(),
    snap: vi.fn(),
    fire: vi.fn(),
    light: vi.fn(),
    medium: vi.fn(),
    heavy: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../ThemeContext', () => ({
  useTheme: () => ({
    mode: 'dark',
    colors: {
      accent: '#FACC15',
      bgSecondary: '#374151',
      borderDefault: '#4B5563',
      textPrimary: '#FFFFFF',
      textSecondary: '#9CA3AF',
    },
  }),
}));

vi.mock('@expo/vector-icons/Ionicons', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) =>
      React.createElement('span', { ref, 'data-testid': `icon-${props.name}` }),
    ),
  };
});

const { PermanentHazardCheckbox } = await import('../PermanentHazardCheckbox');

const LABEL = 'This hazard is permanent';
const HINT = "Won't expire on its own.";

describe('PermanentHazardCheckbox', () => {
  it('renders an empty box and reports unchecked to screen readers', () => {
    render(
      <PermanentHazardCheckbox
        checked={false}
        onChange={vi.fn()}
        label={LABEL}
        hint={HINT}
      />,
    );
    expect(screen.getByTestId('icon-square-outline')).toBeTruthy();
    expect(screen.getByLabelText(LABEL).getAttribute('aria-checked')).toBe('false');
  });

  it('renders a ticked box when checked', () => {
    render(
      <PermanentHazardCheckbox checked onChange={vi.fn()} label={LABEL} hint={HINT} />,
    );
    expect(screen.getByTestId('icon-checkbox')).toBeTruthy();
    expect(screen.getByLabelText(LABEL).getAttribute('aria-checked')).toBe('true');
  });

  it('tapping anywhere on the row toggles — the label is part of the target', () => {
    const onChange = vi.fn();
    render(
      <PermanentHazardCheckbox
        checked={false}
        onChange={onChange}
        label={LABEL}
        hint={HINT}
      />,
    );
    fireEvent.click(screen.getByText(LABEL));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('toggles back off from checked', () => {
    const onChange = vi.fn();
    render(
      <PermanentHazardCheckbox checked onChange={onChange} label={LABEL} hint={HINT} />,
    );
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('does not fire onChange while disabled', () => {
    const onChange = vi.fn();
    render(
      <PermanentHazardCheckbox
        checked={false}
        onChange={onChange}
        label={LABEL}
        hint={HINT}
        disabled
      />,
    );
    fireEvent.click(screen.getByLabelText(LABEL));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('exposes the hint as the accessibility hint, so the rule is announced', () => {
    render(
      <PermanentHazardCheckbox
        checked={false}
        onChange={vi.fn()}
        label={LABEL}
        hint={HINT}
      />,
    );
    // RN web maps accessibilityHint → aria-describedby's target text; assert
    // the string reaches the tree at all rather than the mapping specifics.
    expect(screen.getByText(HINT)).toBeTruthy();
  });
});

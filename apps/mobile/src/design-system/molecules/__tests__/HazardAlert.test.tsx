// @vitest-environment happy-dom
/**
 * HazardAlert Molecule — Unit Tests
 *
 * Covers: score rendering, active-vote highlight, pending-state disable,
 * upvote/downvote callbacks firing.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { NearbyHazard } from '@defensivepedal/core';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../../hooks/useTranslation', () => ({
  useT: () =>
    (key: string, vars?: Record<string, unknown>) => {
      if (vars && Object.keys(vars).length > 0) {
        return `${key}:${JSON.stringify(vars)}`;
      }
      return key;
    },
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

const { HazardAlert } = await import('../HazardAlert');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseHazard: NearbyHazard = {
  id: 'hz-1',
  lat: 44.43,
  lon: 26.10,
  hazardType: 'pothole',
  createdAt: '2026-04-20T08:00:00.000Z',
  confirmCount: 5,
  denyCount: 1,
  score: 4,
  userVote: null,
  expiresAt: '2026-04-27T08:00:00.000Z',
  lastConfirmedAt: '2026-04-20T12:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HazardAlert', () => {
  it('renders the signed community score', () => {
    render(
      <HazardAlert
        hazard={baseHazard}
        distanceMeters={42}
        onUpvote={vi.fn()}
        onDownvote={vi.fn()}
      />,
    );
    expect(screen.getByText('+4')).toBeTruthy();
  });

  it('renders a zero score without a sign', () => {
    render(
      <HazardAlert
        hazard={{ ...baseHazard, score: 0, confirmCount: 1, denyCount: 1 }}
        distanceMeters={100}
        onUpvote={vi.fn()}
        onDownvote={vi.fn()}
      />,
    );
    expect(screen.getByText('0')).toBeTruthy();
  });

  it('renders a negative score with a minus sign', () => {
    render(
      <HazardAlert
        hazard={{ ...baseHazard, score: -2, confirmCount: 1, denyCount: 3 }}
        distanceMeters={100}
        onUpvote={vi.fn()}
        onDownvote={vi.fn()}
      />,
    );
    expect(screen.getByText('\u22122')).toBeTruthy();
  });

  it('fires onUpvote when the upvote button is pressed', () => {
    const onUpvote = vi.fn();
    render(
      <HazardAlert
        hazard={baseHazard}
        distanceMeters={50}
        onUpvote={onUpvote}
        onDownvote={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('hazard.upvoteLabel'));
    expect(onUpvote).toHaveBeenCalledTimes(1);
  });

  it('fires onDownvote when the downvote button is pressed', () => {
    const onDownvote = vi.fn();
    render(
      <HazardAlert
        hazard={baseHazard}
        distanceMeters={50}
        onUpvote={vi.fn()}
        onDownvote={onDownvote}
      />,
    );
    fireEvent.click(screen.getByLabelText('hazard.downvoteLabel'));
    expect(onDownvote).toHaveBeenCalledTimes(1);
  });

  it('highlights the active vote by swapping the icon to its filled variant', () => {
    render(
      <HazardAlert
        hazard={baseHazard}
        distanceMeters={50}
        userVote="up"
        onUpvote={vi.fn()}
        onDownvote={vi.fn()}
      />,
    );
    // When `userVote === 'up'`, the upvote button renders the filled Ionicons
    // glyph (`thumbs-up`) instead of the outline variant (`thumbs-up-outline`).
    expect(screen.getByTestId('icon-thumbs-up')).toBeTruthy();
    // The inactive side still uses the outline variant.
    expect(screen.getByTestId('icon-thumbs-down-outline')).toBeTruthy();
  });

  it('disables both vote buttons while voting is pending', () => {
    const onUpvote = vi.fn();
    const onDownvote = vi.fn();
    render(
      <HazardAlert
        hazard={baseHazard}
        distanceMeters={50}
        voteState="pending"
        onUpvote={onUpvote}
        onDownvote={onDownvote}
      />,
    );
    const upButton = screen.getByLabelText('hazard.upvoteLabel');
    const downButton = screen.getByLabelText('hazard.downvoteLabel');
    fireEvent.click(upButton);
    fireEvent.click(downButton);
    expect(onUpvote).not.toHaveBeenCalled();
    expect(onDownvote).not.toHaveBeenCalled();
  });
});

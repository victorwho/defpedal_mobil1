/**
 * FollowRequestItem Unit Tests
 *
 * Props-interface tests in the same style as SettingRow.test.tsx — verifies
 * the component's TypeScript contract without requiring a full React Native
 * render harness.
 *
 * Slice 4: the `context` prop is introduced so claims against a private-profile
 * sharer can surface "signed up via your shared route and wants to follow you"
 * as a contextual subtitle. Every existing caller site must still compile with
 * `context` omitted (it's optional).
 */
import { describe, expect, it } from 'vitest';
import type { FollowRequestItemProps } from '../FollowRequestItem';

const baseRequest: FollowRequestItemProps['request'] = {
  id: 'req-1',
  user: {
    id: 'user-a',
    displayName: 'Alice Rider',
    avatarUrl: null,
    riderTier: 'spoke',
  } as FollowRequestItemProps['request']['user'],
  requestedAt: '2026-04-19T10:00:00.000Z',
};

describe('FollowRequestItem', () => {
  describe('Props interface', () => {
    it('requires request, onApprove, onDecline', () => {
      const props: FollowRequestItemProps = {
        request: baseRequest,
        onApprove: () => {},
        onDecline: () => {},
      };

      expect(props.request.id).toBe('req-1');
      expect(typeof props.onApprove).toBe('function');
      expect(typeof props.onDecline).toBe('function');
    });

    it('slice 4: accepts optional context subtitle for share-attributed requests', () => {
      const props: FollowRequestItemProps = {
        request: baseRequest,
        onApprove: () => {},
        onDecline: () => {},
        context: 'Signed up via your shared route',
      };

      expect(props.context).toBe('Signed up via your shared route');
    });

    it('slice 4: existing callers without context still type-check', () => {
      // This is the regression guard — PR #7's existing Profile-screen caller
      // must keep compiling without changes.
      const props: FollowRequestItemProps = {
        request: baseRequest,
        onApprove: () => {},
        onDecline: () => {},
      };

      expect(props.context).toBeUndefined();
    });
  });

  describe('onApprove / onDecline contracts', () => {
    it('onApprove receives the request id', () => {
      let captured: string | null = null;
      const props: FollowRequestItemProps = {
        request: baseRequest,
        onApprove: (id) => {
          captured = id;
        },
        onDecline: () => {},
      };

      props.onApprove(props.request.id);
      expect(captured).toBe('req-1');
    });

    it('onDecline receives the request id', () => {
      let captured: string | null = null;
      const props: FollowRequestItemProps = {
        request: baseRequest,
        onApprove: () => {},
        onDecline: (id) => {
          captured = id;
        },
      };

      props.onDecline(props.request.id);
      expect(captured).toBe('req-1');
    });
  });
});

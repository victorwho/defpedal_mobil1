-- push_receipts: the ticket_id -> token map that makes Expo receipt polling possible.
--
-- Audit finding SCALE-18. `lib/push.ts` has shipped a working receipt poller
-- (`checkReceipts`) since 2026-06-12 with ZERO callers, because a receipt is keyed
-- by Expo TICKET ID and does not carry the token — and nothing persisted that
-- mapping. `notification_log` and `nudge_log` both store `expo_ticket_id`, but
-- neither stores the token, so neither can resolve a receipt back to the row in
-- `push_tokens` that needs deleting.
--
-- Why this matters: today only the IMMEDIATE in-ticket `DeviceNotRegistered`
-- signal prunes a token (`notifications.ts`, `nudges/dispatcher.ts`). Expo issues
-- that at accept time; the far more common case is a token that accepts fine and
-- then fails at the FCM/APNs hop minutes later, reported only in the receipt.
-- Those tokens are never pruned, accumulate forever, and Expo deprioritises
-- senders with high error rates — so dead tokens degrade delivery for everyone
-- (the same reputational mechanism behind error-log #69's silent outage).
--
-- Lifecycle: one row per accepted ticket, deleted as soon as its receipt is read.
-- Expo retains receipts for ~24 h, so any row still unresolved after that is
-- dropped as expired. The table therefore stays at roughly one send-batch in size
-- and needs no retention cron of its own (contrast SCALE-12).
--
-- `expo_push_token` is stored alongside `user_id` because `push_tokens` is UNIQUE
-- on (user_id, device_id), NOT on the token — pruning must match both columns.

CREATE TABLE IF NOT EXISTS push_receipts (
  ticket_id       TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The cron reads oldest-first and ages rows out at 24 h.
CREATE INDEX IF NOT EXISTS idx_push_receipts_created_at ON push_receipts (created_at);

-- Service-role only. No client ever reads or writes this table; RLS with no
-- policies is deny-all for anon/authenticated, and service_role bypasses RLS.
ALTER TABLE push_receipts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON push_receipts TO service_role;
REVOKE ALL ON push_receipts FROM anon, authenticated;

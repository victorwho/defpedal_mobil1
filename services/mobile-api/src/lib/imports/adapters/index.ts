/**
 * Adapter dispatch.
 *
 * `civia` is intentionally absent: the source row exists in
 * `hazard_import_sources` (disabled) so that granting consent is a one-line
 * config change, but the adapter is not built until civia.ro replies to the
 * permission request. Their robots.txt blocks every AI-crawler UA, disallows
 * /api/, and files an explicit EU DSM Art. 4 TDM reservation.
 *
 * The runner treats a missing adapter as a source-level failure, so enabling
 * `civia` before the adapter exists fails loudly rather than silently
 * importing nothing.
 */
import { open311Adapter } from './open311';
import type { HazardSourceAdapter } from '../types';

const ADAPTERS: Readonly<Record<string, HazardSourceAdapter>> = {
  open311: open311Adapter,
};

export const getAdapter = (name: string): HazardSourceAdapter | null =>
  ADAPTERS[name] ?? null;

export const registeredAdapterNames = (): string[] => Object.keys(ADAPTERS);

export { open311Adapter };

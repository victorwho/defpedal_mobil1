/**
 * Adapter dispatch.
 *
 * `civia` landed 2026-09-01 once civia.ro granted consent. That consent covers
 * their PUBLIC pages only — robots.txt still carries `Disallow: /api/` and an
 * EU DSM Art. 4 TDM reservation — so the adapter reads feed.xml, sitemap.xml
 * and /sesizari/<id> and must never reach for /api/*.
 *
 * The runner treats a missing adapter as a source-level failure, so enabling a
 * source before its adapter exists fails loudly rather than silently importing
 * nothing.
 */
import { amsterdamAdapter } from './amsterdam';
import { civiaAdapter } from './civia';
import { open311Adapter } from './open311';
import type { HazardSourceAdapter } from '../types';

const ADAPTERS: Readonly<Record<string, HazardSourceAdapter>> = {
  open311: open311Adapter,
  signalen: amsterdamAdapter,
  civia: civiaAdapter,
};

export const getAdapter = (name: string): HazardSourceAdapter | null =>
  ADAPTERS[name] ?? null;

export const registeredAdapterNames = (): string[] => Object.keys(ADAPTERS);

export { amsterdamAdapter, civiaAdapter, open311Adapter };

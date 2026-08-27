/**
 * Display metadata for external hazard-import sources.
 *
 * The authoritative registry is the `hazard_import_sources` table; this is the
 * client-side view of it, used only to render provenance on the hazard detail
 * sheet. It is a static map rather than a server field because the set changes
 * about as often as a release, and shipping the string avoids widening the
 * hazards payload for every rider on every 60s poll.
 *
 * Attribution here is transparency, not a licence obligation: Cologne's data
 * is released under Datenlizenz Deutschland – Zero – 2.0 (public-domain
 * equivalent, no attribution required). We show it anyway so riders can tell
 * a municipal report from a cyclist's sighting — which materially changes how
 * much they should trust the pin.
 *
 * A source id with no entry here renders a neutral fallback rather than
 * nothing, so a newly enabled source can never appear as if a rider reported
 * it.
 */

export interface HazardImportSourceDisplay {
  /** Short human label, shown as "Reported via {label}". */
  readonly label: string;
  /** Public page describing the source/dataset. */
  readonly url: string;
}

export const HAZARD_IMPORT_SOURCE_DISPLAY: Readonly<
  Record<string, HazardImportSourceDisplay>
> = {
  'open311:koln': {
    label: "Sag's uns – Stadt Köln",
    url: 'https://offenedaten-koeln.de/dataset/sags-uns-anliegenmanagement-koeln',
  },
  civia: {
    label: 'Civia.ro',
    url: 'https://civia.ro',
  },
};

/** Neutral label for a source we have display metadata for. */
export const getHazardImportSourceDisplay = (
  importSource: string | null | undefined,
): HazardImportSourceDisplay | null => {
  if (!importSource) return null;
  return (
    HAZARD_IMPORT_SOURCE_DISPLAY[importSource] ?? {
      label: 'a public city report',
      url: '',
    }
  );
};

/** True when the hazard came from an external source rather than a rider. */
export const isImportedHazard = (
  hazard: { readonly importSource?: string | null } | null | undefined,
): boolean => Boolean(hazard?.importSource);

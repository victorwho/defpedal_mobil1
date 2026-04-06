/**
 * Design System v1.0 — Z-Index Tokens
 *
 * Layering scale for overlapping elements.
 * Values derived from actual usage across the app.
 *
 * Stack order (bottom → top):
 *   content → overlay → popover → sticky → modal → toast → supreme
 */

export const zIndex = {
  /** Default content layer */
  base: 1,

  /** Map overlays, basic floating elements */
  overlay: 10,

  /** Floating cards, popovers, POI popups */
  popover: 25,

  /** Sticky headers, navigation bars */
  sticky: 50,

  /** Modals, bottom sheets, search overlays */
  modal: 100,

  /** Toasts, hazard alerts, top-level notifications */
  toast: 200,

  /** Fullscreen celebrations, badge unlock overlay */
  supreme: 9999,
} as const;

/**
 * Static asset module declarations for ES `import` syntax.
 *
 * Metro returns an opaque numeric handle for `import x from './x.png'`; the
 * matching TypeScript declaration lets tsc accept the import without
 * @ts-expect-error. Mirrors what `expo/types` ships for some asset types
 * but not PNG. Used by `routeFeatureIcons.ts` (map-icons/*.png).
 */
declare module '*.png' {
  const content: number;
  export default content;
}

declare module '*.jpg' {
  const content: number;
  export default content;
}

declare module '*.svg' {
  const content: number;
  export default content;
}

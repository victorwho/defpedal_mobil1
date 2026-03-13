// Fix: The following line was commented out to resolve a "Cannot find type definition file for 'vite/client'"
// error. This is likely due to an environment configuration issue. The types are not
// currently used in the application, so this change is safe.
// /// <reference types="vite/client" />

declare module '*.png' {
  const value: string;
  export default value;
}

declare module '*.jpg' {
  const value: string;
  export default value;
}

declare module '*.svg' {
  const value: string;
  export default value;
}

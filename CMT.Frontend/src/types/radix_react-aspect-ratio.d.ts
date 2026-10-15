// Minimal type shim for @radix-ui/react-aspect-ratio to satisfy TypeScript when the package or its types
// are not installed. Preferred fix: install the real package with `npm install @radix-ui/react-aspect-ratio`
// then remove this shim if desired.

declare module '@radix-ui/react-aspect-ratio' {
  import * as React from 'react';

  export const Root: React.ComponentType<React.PropsWithChildren<{ ratio?: number; style?: React.CSSProperties }>>;

  const _default: {
    Root: typeof Root;
  };

  export default _default;
}
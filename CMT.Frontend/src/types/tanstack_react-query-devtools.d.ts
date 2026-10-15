// Minimal type shim for '@tanstack/react-query-devtools' to satisfy TypeScript
// when the package or its type declarations are not installed. Preferred fix:
// install the real package with `npm install @tanstack/react-query-devtools`
// and remove this shim afterwards.

declare module '@tanstack/react-query-devtools' {
  import * as React from 'react';

  export interface ReactQueryDevtoolsProps {
    initialIsOpen?: boolean;
    position?: 'top-right' | 'bottom-right' | 'bottom-left' | 'top-left';
    // allow any other props to be forwarded
    [key: string]: any;
  }

  export const ReactQueryDevtools: React.FC<ReactQueryDevtoolsProps>;

  export default ReactQueryDevtools;
}
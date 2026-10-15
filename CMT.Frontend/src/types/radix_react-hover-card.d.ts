// Minimal type shim for '@radix-ui/react-hover-card' to satisfy TypeScript when the package
// or its type declarations are not installed. Preferred fix: install the real package with:
//   npm install @radix-ui/react-hover-card
// then remove this shim if desired.

declare module '@radix-ui/react-hover-card' {
  import * as React from 'react';

  type AnyProps = Record<string, any>;
  type Forwardable = React.ForwardRefExoticComponent<React.PropsWithoutRef<AnyProps> & React.RefAttributes<any>>;

  export const Root: Forwardable;
  export const Trigger: Forwardable;
  export const Content: Forwardable;
  export const Portal: Forwardable;
  export const Arrow: Forwardable;

  export default {
    Root,
    Trigger,
    Content,
    Portal,
    Arrow,
  };
}
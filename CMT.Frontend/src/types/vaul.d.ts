// Minimal type shim for 'vaul' to satisfy TypeScript when the real package or its types
// are not installed. Preferred runtime fix: install the real package with:
//   npm install vaul
// then remove this shim if desired.

declare module 'vaul' {
  import * as React from 'react';

  type AnyProps = Record<string, any>;
  type Forwardable = React.ForwardRefExoticComponent<React.PropsWithoutRef<AnyProps> & React.RefAttributes<any>>;

  export const Drawer: {
    Root: Forwardable & React.FC<React.PropsWithChildren<{
      shouldScaleBackground?: boolean;
      children?: React.ReactNode;
      className?: string;
    }>>;
    Trigger: Forwardable;
    Portal: Forwardable;
    Close: Forwardable;
    Overlay: Forwardable;
    Content: Forwardable;
    Title: Forwardable;
    Description: Forwardable;
  };

  // Named export used in code: { Drawer as DrawerPrimitive }
  export { Drawer as DrawerPrimitive };

  export default {
    Drawer,
    DrawerPrimitive: Drawer,
  };
}
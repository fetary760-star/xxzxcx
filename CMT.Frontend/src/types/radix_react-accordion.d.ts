// Minimal type shim for @radix-ui/react-accordion to satisfy TypeScript when types/package are missing.
// Prefer installing the real package: npm install @radix-ui/react-accordion

declare module '@radix-ui/react-accordion' {
  import * as React from 'react';

  export const Root: React.ComponentType<any>;
  export const Item: React.ComponentType<any>;
  export const Header: React.ComponentType<any>;
  export const Trigger: React.ComponentType<any>;
  export const Content: React.ComponentType<any>;

  // fallback export if someone does `import * as AccordionPrimitive from '@radix-ui/react-accordion'`
  const _default: {
    Root: typeof Root;
    Item: typeof Item;
    Header: typeof Header;
    Trigger: typeof Trigger;
    Content: typeof Content;
  };
  export default _default;
}
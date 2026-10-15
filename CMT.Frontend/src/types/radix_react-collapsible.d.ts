// Minimal type shim for '@radix-ui/react-collapsible' to satisfy TypeScript when the package
// or its types are not installed. Preferred fix: install the real package with:
//   npm install @radix-ui/react-collapsible
// then remove this shim if desired.

declare module '@radix-ui/react-collapsible' {
  import * as React from 'react';

  export const Root: React.ComponentType<React.PropsWithChildren<{
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: React.ReactNode;
    className?: string;
  }>>;

  export const CollapsibleTrigger: React.ComponentType<React.ComponentProps<'button'>>;
  export const CollapsibleContent: React.ComponentType<React.PropsWithChildren<{
    children?: React.ReactNode;
    className?: string;
    style?: React.CSSProperties;
  }>>;

  const _default: {
    Root: typeof Root;
    CollapsibleTrigger: typeof CollapsibleTrigger;
    CollapsibleContent: typeof CollapsibleContent;
  };

  export default _default;
}
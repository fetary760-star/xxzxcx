// Minimal type shim for '@radix-ui/react-context-menu' to satisfy TypeScript when the package or types
// are not installed. Preferred fix: install the real package with:
//   npm install @radix-ui/react-context-menu
// then remove this shim if desired.

declare module '@radix-ui/react-context-menu' {
  import * as React from 'react';

  type AnyProps = Record<string, any>;
  type Forwardable = React.ForwardRefExoticComponent<React.PropsWithoutRef<AnyProps> & React.RefAttributes<any>>;

  export const Root: Forwardable;
  export const Trigger: Forwardable;
  export const Content: Forwardable;
  export const Item: Forwardable;
  export const CheckboxItem: Forwardable;
  export const RadioItem: Forwardable;
  export const Label: Forwardable;
  export const Separator: Forwardable;
  export const Group: Forwardable;
  export const Portal: Forwardable;
  export const Sub: Forwardable;
  export const SubTrigger: Forwardable;
  export const SubContent: Forwardable;
  export const RadioGroup: Forwardable;

  // ItemIndicator may be used as a child primitive
  export const ItemIndicator: Forwardable;

  export default {
    Root,
    Trigger,
    Content,
    Item,
    CheckboxItem,
    RadioItem,
    Label,
    Separator,
    Group,
    Portal,
    Sub,
    SubTrigger,
    SubContent,
    RadioGroup,
    ItemIndicator,
  };
}
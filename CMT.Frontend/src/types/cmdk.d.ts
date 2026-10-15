// Minimal, stronger type shim for 'cmdk' so TypeScript accepts usages like
// `CommandPrimitive.Input` with `React.forwardRef` etc.
// Preferred: install the real `cmdk` package (`npm i cmdk`) and remove this shim.

declare module 'cmdk' {
  import * as React from 'react';

  // Generic props used across the primitives
  type AnyProps = Record<string, any>;

  // Use ForwardRefExoticComponent so `React.forwardRef` and `ElementRef<typeof ...>` work
  type CmdkComponent = React.ForwardRefExoticComponent<React.PropsWithoutRef<AnyProps> & React.RefAttributes<any>>;

  export const Command: CmdkComponent & {
    Input: CmdkComponent;
    List: CmdkComponent;
    Empty: CmdkComponent;
    Group: CmdkComponent;
    Separator: CmdkComponent;
    Item: CmdkComponent;
  };

  export default Command;
}
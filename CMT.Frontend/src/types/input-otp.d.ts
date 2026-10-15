// Minimal type shim for 'input-otp' to satisfy TypeScript when the package or its types
// are not installed. Preferred fix: install the real package with:
//   npm install input-otp
// then remove this shim if desired.

declare module 'input-otp' {
  import * as React from 'react';

  export type OTPSlot = {
    char?: React.ReactNode;
    isActive?: boolean;
    hasFakeCaret?: boolean;
  };

  export interface OTPInputContextValue {
    slots: OTPSlot[];
    value?: string;
    focus?: () => void;
  }

  export const OTPInputContext: React.Context<OTPInputContextValue>;

  export type OTPInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
    length?: number;
    containerClassName?: string;
    className?: string;
    onChange?: (value: string) => void;
    value?: string;
  };

  export const OTPInput: React.ForwardRefExoticComponent<React.PropsWithoutRef<OTPInputProps> & React.RefAttributes<HTMLInputElement>>;

  export default OTPInput;
}
// Minimal type shim for 'react-hook-form' to satisfy TypeScript builds when the package
// or its type declarations are not installed. Preferred fix: install 'react-hook-form' with:
//   npm install react-hook-form
// and remove this shim if desired.

declare module 'react-hook-form' {
  import * as React from 'react';

  // Basic FieldValues and FieldPath types used in the codebase
  export type FieldValues = Record<string, any>;
  export type FieldPath<TFieldValues extends FieldValues = FieldValues> = string & keyof any;

  // Simplified render props passed to controlled components
  export type ControllerRenderProps = {
    value?: any;
    onChange?: (...args: any[]) => void;
    onBlur?: (...args: any[]) => void;
    name?: string;
  };

  export interface ControllerProps<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  > {
    name: TName;
    control?: any;
    rules?: any;
    defaultValue?: any;
    shouldUnregister?: boolean;
    render?: (props: ControllerRenderProps) => React.ReactElement | null;
  }

  /**
   * Controller component (minimal typing)
   */
  export function Controller<
    TFieldValues extends FieldValues = FieldValues,
    TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
  >(props: ControllerProps<TFieldValues, TName>): JSX.Element;

  /**
   * FormProvider (minimal)
   * In your code you alias: const Form = FormProvider;
   */
  export const FormProvider: React.FC<any>;

  /**
   * useFormContext minimal shape used by the code above
   */
  export function useFormContext<TFieldValues extends FieldValues = FieldValues>(): {
    getFieldState: (name: string, formState?: any) => any;
    formState: any;
    control?: any;
    register?: (...args: any[]) => any;
  };
}
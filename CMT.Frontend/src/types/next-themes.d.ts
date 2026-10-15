declare module 'next-themes' {
  import * as React from 'react';

  export interface ThemeProviderProps {
    children?: React.ReactNode;
    enableSystem?: boolean;
    attribute?: string;
    defaultTheme?: string;
    storageKey?: string;
  }

  export function ThemeProvider(props: ThemeProviderProps & { children?: React.ReactNode }): JSX.Element;

  // If you use the hook, add basic types:
  export function useTheme(): {
    theme: string | undefined;
    setTheme: (t: string) => void;
    resolvedTheme?: string;
  };

  export default { ThemeProvider, useTheme };
}
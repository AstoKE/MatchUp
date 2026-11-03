import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';
import {
  breakpointForWidth,
  darkColors,
  lightColors,
  motion,
  radius,
  spacing,
  typography,
  type Breakpoint,
  type SemanticColors,
} from '../tokens';
import { readStoredScheme, storeScheme, type SchemePreference } from './scheme-preference';

export type { SchemePreference };

export interface Theme {
  scheme: 'light' | 'dark';
  isDark: boolean;
  colors: SemanticColors;
  spacing: typeof spacing;
  radius: typeof radius;
  typography: typeof typography;
  motion: typeof motion;
  breakpoint: Breakpoint;
}

interface ThemeContextValue {
  theme: Theme;
  preference: SchemePreference;
  setPreference: (preference: SchemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  initialPreference,
}: {
  children: ReactNode;
  initialPreference?: SchemePreference;
}) {
  const systemScheme = useColorScheme();
  const { width } = useWindowDimensions();
  // The app starts light (docs/design.md §13); a choice made on this device wins.
  const [preference, setPreferenceState] = useState<SchemePreference>(
    () => initialPreference ?? readStoredScheme() ?? 'light',
  );
  const setPreference = useCallback((next: SchemePreference) => {
    setPreferenceState(next);
    storeScheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    const scheme: 'light' | 'dark' =
      preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
    return {
      preference,
      setPreference,
      theme: {
        scheme,
        isDark: scheme === 'dark',
        colors: scheme === 'dark' ? darkColors : lightColors,
        spacing,
        radius,
        typography,
        motion,
        breakpoint: breakpointForWidth(width),
      },
    };
  }, [preference, setPreference, systemScheme, width]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function useThemeContext(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used inside <ThemeProvider>');
  return context;
}

export function useTheme(): Theme {
  return useThemeContext().theme;
}

export function useSchemePreference() {
  const { preference, setPreference } = useThemeContext();
  return { preference, setPreference };
}

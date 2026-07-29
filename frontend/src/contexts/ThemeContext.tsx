import React, { createContext, useContext, useState, useLayoutEffect, useCallback } from 'react';

type Theme = 'light' | 'dark';

/** Opaque form of --color-nav per theme (design §4.4 / §4.10). The browser
 *  status bar wants a solid colour; jsdom cannot resolve the @theme rgba(), so
 *  these are pinned constants matching the static index.html value (#0b0e13). */
const NAV_THEME_COLOR: Record<Theme, string> = {
  dark: '#0b0e13',
  light: '#ffffff',
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

/** Read the localStorage theme seed. The index.html bootstrap has already
 *  applied the matching class before first paint, so this only mirrors that
 *  seed into React state — no fetch, no flash. */
function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem('theme');
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  } catch {
    return 'dark';
  }
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Seeded synchronously from localStorage. The per-account theme (user.theme)
  // is applied over this seed by useThemeSync once auth resolves — mirroring the
  // accent architecture, ThemeProvider stays auth-agnostic (it mounts outside
  // AuthProvider) and handles only the local apply + localStorage. The account
  // write (PUT /auth/me) lives in useThemePreference at the toggle sites.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const applyTheme = useCallback((newTheme: Theme) => {
    const html = document.documentElement;
    if (newTheme === 'light') {
      html.classList.add('light');
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
      html.classList.remove('light');
    }
    // theme-color tracks the app bar (--color-nav), not the accent (§4.10).
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', NAV_THEME_COLOR[newTheme]);
    }
  }, []);

  // Apply before paint on mount and whenever the theme changes (toggle or
  // useThemeSync). The bootstrap already applied the initial class, so the mount
  // pass is an idempotent no-op that also keeps meta[theme-color] correct.
  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme, applyTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

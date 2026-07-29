"""UI theme constants — the two selectable light/dark themes.

The single source of truth for backend-side theme validation. Mirrors the
frontend's ``Theme`` union in ``src/contexts/ThemeContext.tsx``; keep the two in
sync when adding or removing a theme.
"""

SUPPORTED_THEMES: set[str] = {"light", "dark"}

DEFAULT_THEME: str = "dark"

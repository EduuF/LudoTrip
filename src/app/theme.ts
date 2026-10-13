// Modo dia e noite: "auto" segue o aparelho; "claro" e "escuro" ficam lembrados no navegador.
// O `data-theme` no <html> é o que o CSS (tokens) e o mapa de tiles leem.

export type ThemeChoice = 'auto' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'ludotrip.theme'

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'auto') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* sem armazenamento */
  }
}

/** O tema em vigor agora (resolvendo "auto" pelo aparelho). */
export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme
  if (t === 'dark') return 'dark'
  if (t === 'light') return 'light'
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export const nextChoice = (c: ThemeChoice): ThemeChoice =>
  c === 'auto' ? 'dark' : c === 'dark' ? 'light' : 'auto'

export const THEME_LABEL: Record<ThemeChoice, string> = {
  auto: 'Tema: automático',
  light: 'Tema: claro',
  dark: 'Tema: escuro',
}
export const THEME_GLYPH: Record<ThemeChoice, string> = { auto: '◐', light: '☀', dark: '☾' }

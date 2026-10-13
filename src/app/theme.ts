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

/** O botão alterna entre claro e escuro a partir do que está na tela; o "auto" só existe antes do
 *  primeiro toque (três estados fariam um dos modos repetir e o botão parecer quebrado). */
export const toggledTheme = (): ThemeChoice => (currentTheme() === 'dark' ? 'light' : 'dark')

export const THEME_GLYPH: Record<Theme, string> = { light: '☀', dark: '☾' }
export const THEME_ACTION: Record<Theme, string> = {
  light: 'Mudar para o modo escuro',
  dark: 'Mudar para o modo claro',
}

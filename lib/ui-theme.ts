// Sistema de Temas de Interface (UI Themes) do painel — cultura K-pop.
// A troca é instantânea: o atributo data-theme no <html> redefine as
// variáveis CSS (--background, --primary, --radius, fontes...) que TODOS
// os componentes já consomem via tokens semânticos do Tailwind.

export const UI_THEME_KEY = 'kdist-ui-theme'

export type UiTheme = 'concert' | 'photocard' | 'studio' | 'comeback'

export const UI_THEMES: { id: UiTheme; label: string; description: string }[] = [
  {
    id: 'concert',
    label: 'Concert Neon',
    description: 'Show ao vivo: fundo escuro, gradientes neon e glow',
  },
  {
    id: 'photocard',
    label: 'Idol Photocard',
    description: 'Fofo e soft: creme, pastéis e cantos bem arredondados',
  },
  {
    id: 'studio',
    label: 'Studio Minimal',
    description: 'Profissional: escala de cinza, flat, zero distração',
  },
  {
    id: 'comeback',
    label: 'Comeback Poster',
    description: 'Editorial: alto contraste, cores sólidas e cantos vivos',
  },
]

export const DEFAULT_UI_THEME: UiTheme = 'concert'

export function isUiTheme(v: unknown): v is UiTheme {
  return v === 'concert' || v === 'photocard' || v === 'studio' || v === 'comeback'
}

/** Lê o tema salvo (localStorage), com fallback seguro para o padrão. */
export function getSavedUiTheme(): UiTheme {
  if (typeof window === 'undefined') return DEFAULT_UI_THEME
  try {
    const saved = window.localStorage.getItem(UI_THEME_KEY)
    return isUiTheme(saved) ? saved : DEFAULT_UI_THEME
  } catch {
    return DEFAULT_UI_THEME
  }
}

/** Aplica o tema no <html> e persiste a preferência. */
export function applyUiTheme(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme
  try {
    window.localStorage.setItem(UI_THEME_KEY, theme)
  } catch {
    // localStorage indisponível (modo privado): o tema vale só na sessão
  }
}

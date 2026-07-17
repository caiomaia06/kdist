'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Palette } from 'lucide-react'
import {
  DEFAULT_UI_THEME,
  UI_THEMES,
  applyUiTheme,
  getSavedUiTheme,
  type UiTheme,
} from '@/lib/ui-theme'

/**
 * Seletor de Temas de Interface (dropdown). Troca o data-theme do <html>
 * instantaneamente e salva a preferência no localStorage.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<UiTheme>(DEFAULT_UI_THEME)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Hidrata com o tema salvo (o script inline do layout já aplicou no <html>)
  useEffect(() => {
    setTheme(getSavedUiTheme())
  }, [])

  // Fecha ao clicar fora ou apertar Escape
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const select = (t: UiTheme) => {
    setTheme(t)
    applyUiTheme(t)
    setOpen(false)
  }

  const current = UI_THEMES.find((t) => t.id === theme) ?? UI_THEMES[0]

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Tema da interface: ${current.label}`}
        className="flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Palette className="size-4 text-muted-foreground" />
        <span className="hidden sm:inline">{current.label}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Temas da interface"
          className="absolute right-0 z-50 mt-1.5 w-64 overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {UI_THEMES.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                role="option"
                aria-selected={theme === t.id}
                onClick={() => select(t.id)}
                className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-accent hover:text-accent-foreground ${
                  theme === t.id ? 'bg-accent/60' : ''
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 size-4 shrink-0 rounded-full border border-border theme-dot-${t.id}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">{t.label}</span>
                  <span className="block text-[11px] leading-snug text-muted-foreground">
                    {t.description}
                  </span>
                </span>
                {theme === t.id && <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

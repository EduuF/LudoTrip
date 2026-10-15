import { useEffect, useRef, useState } from 'react'
import { useApp } from '../app/store'
import { currentTheme, THEME_ACTION, THEME_LABEL, toggledTheme } from '../app/theme'
import { canAnimate, playThemeSwap } from './themeSwap'
import { sfx } from './sound'
import { CAST, castFor } from './stage/cast'

// O botão Dia/Noite (retorno do staging): com nome, e uma lanterna ou lâmpada sorteada a cada toque.
// Quem desce a corda é um dos viajantes da viagem aberta (em "Suas viagens", qualquer um do elenco).
// Enquanto a animação acontece, o botão não aceita outro toque (sem duas animações sobrepostas).

export function ThemeToggle({ className = 'hud-btn' }: { className?: string }) {
  useApp((s) => s.theme) // redesenha ao trocar o tema
  const setTheme = useApp((s) => s.setTheme)
  const travelers = useApp((s) => s.doc?.itinerary.travelers.length ?? 0)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])
  const mode = currentTheme()
  const toggle = () => {
    if (busy) return
    const next = toggledTheme()
    if (!canAnimate() || !ref.current) return setTheme(next)
    setBusy(true)
    stop.current = playThemeSwap(
      ref.current,
      next === 'dark',
      () => {
        setTheme(next)
        sfx.pop()
      },
      () => {
        stop.current = null
        setBusy(false)
      },
      undefined,
      castFor(Math.floor(Math.random() * Math.min(travelers || CAST.length, CAST.length))),
    )
  }
  return (
    <button
      ref={ref}
      type="button"
      className={`${className} theme-toggle${busy ? ' busy' : ''}`}
      aria-label={THEME_ACTION[mode]}
      title={THEME_ACTION[mode]}
      aria-disabled={busy || undefined}
      onClick={toggle}
    >
      {THEME_LABEL[mode]}
    </button>
  )
}

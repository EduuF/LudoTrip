// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'
import { SWAP } from './themeSwap'
import { FADE } from './daylight'
import { useApp } from '../app/store'
import { currentTheme } from '../app/theme'

// Dia/Noite v2: a corda desce com a lanterna ou a lâmpada, o bonequinho desce, age, e o tema troca no
// começo do pôr/nascer do sol (que dura FADE); o botão não aceita outro toque até a luz acabar.

const motion = (reduce: boolean) =>
  ((q: string) =>
    ({
      matches: reduce && q.includes('reduce'),
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme')
  useApp.getState().setTheme('light')
  Element.prototype.animate = vi.fn(() => ({}) as Animation)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('botão Dia/Noite', () => {
  it('corda, descida, ação; o tema troca com o pôr do sol; travado até a luz acabar; nada fica', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    render(<ThemeToggle />)
    const btn = screen.getByRole('button', { name: 'Mudar para o modo escuro' })
    expect(btn.textContent).toBe('☾ Noite')
    fireEvent.click(btn)
    expect(document.querySelector('.theme-swap .swap-rope')).toBeTruthy()
    expect(document.querySelector('.theme-swap .swap-guy')).toBeTruthy()
    // Durante a descida e a ação, o tema ainda não trocou.
    act(() => void vi.advanceTimersByTime(SWAP.act[0]))
    expect(currentTheme()).toBe('light')
    act(() => void vi.advanceTimersByTime(SWAP.light - SWAP.act[0]))
    expect(currentTheme()).toBe('dark')
    expect(btn.textContent).toBe('☀ Dia')
    expect(document.documentElement.classList.contains('theme-fading')).toBe(true)
    expect(document.querySelector('.daylight-veil.sunset')).toBeTruthy()
    // Ainda animando: outro toque não faz nada.
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(btn)
    act(() => void vi.advanceTimersByTime(SWAP.ropeUp[1] + 100 - SWAP.light))
    expect(currentTheme()).toBe('dark')
    // A corda já subiu, mas a luz continua: o botão segue travado.
    expect(document.querySelector('.theme-swap')).toBeNull()
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    act(() => void vi.advanceTimersByTime(SWAP.end))
    expect(document.querySelector('.daylight-veil')).toBeNull()
    expect(document.documentElement.classList.contains('theme-fading')).toBe(false)
    expect(btn.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(btn)
    act(() => void vi.advanceTimersByTime(SWAP.end + 100))
    expect(currentTheme()).toBe('light')
    // De volta ao dia: nascer do sol.
    expect(SWAP.end).toBe(SWAP.light + FADE)
  })

  it('nascer do sol ao voltar para o dia; quem desce é um dos viajantes do elenco', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    useApp.getState().setTheme('dark')
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: 'Mudar para o modo claro' }))
    expect(document.querySelector('.swap-guy rect')).toBeTruthy()
    act(() => void vi.advanceTimersByTime(SWAP.light))
    expect(document.querySelector('.daylight-veil.sunrise')).toBeTruthy()
    expect(currentTheme()).toBe('light')
    act(() => void vi.advanceTimersByTime(SWAP.end))
  })

  it('sorteia lanterna ou lâmpada', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    const seen = new Set<string>()
    // Por toque: primeiro quem desce a corda, depois o objeto.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.9)
    render(<ThemeToggle />)
    for (let i = 0; i < 2; i++) {
      fireEvent.click(screen.getByRole('button'))
      seen.add(document.querySelector('.theme-swap')!.className)
      act(() => void vi.advanceTimersByTime(SWAP.end + 100))
    }
    expect([...seen].sort()).toEqual(['theme-swap bulb', 'theme-swap lantern'])
  })

  it('com "reduzir movimento", troca na hora e sem animação', () => {
    window.matchMedia = motion(true)
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    expect(currentTheme()).toBe('dark')
    expect(document.querySelector('.theme-swap')).toBeNull()
  })

  it('se a tela sai no meio, o tema troca mesmo assim e nada fica para trás', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    const { unmount } = render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button'))
    unmount()
    expect(currentTheme()).toBe('dark')
    expect(document.querySelector('.theme-swap')).toBeNull()
    expect(document.querySelector('.daylight-veil')).toBeNull()
    expect(document.documentElement.classList.contains('theme-fading')).toBe(false)
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'
import { SWAP } from './themeSwap'
import { useApp } from '../app/store'
import { currentTheme } from '../app/theme'

// Dia/Noite (retorno do staging): a lanterna ou a lâmpada aparece só durante a troca, o tema troca no
// momento da ação, e o botão não aceita outro toque até tudo sumir.

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
  it('troca no momento da ação; travado até a lanterna/lâmpada sumir; nada fica na tela', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    render(<ThemeToggle />)
    const btn = screen.getByRole('button', { name: 'Mudar para o modo escuro' })
    expect(btn.textContent).toBe('☾ Noite')
    fireEvent.click(btn)
    expect(document.querySelector('.theme-swap')).toBeTruthy()
    expect(currentTheme()).toBe('light')
    act(() => void vi.advanceTimersByTime(SWAP.act))
    expect(currentTheme()).toBe('dark')
    expect(btn.textContent).toBe('☀ Dia')
    // Ainda animando: outro toque não faz nada.
    expect(btn.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(btn)
    act(() => void vi.advanceTimersByTime(100))
    expect(currentTheme()).toBe('dark')
    act(() => void vi.advanceTimersByTime(SWAP.end))
    expect(document.querySelector('.theme-swap')).toBeNull()
    expect(document.querySelector('.theme-swap-wipe')).toBeNull()
    expect(btn.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(btn)
    act(() => void vi.advanceTimersByTime(SWAP.end + 100))
    expect(currentTheme()).toBe('light')
  })

  it('sorteia lanterna ou lâmpada', () => {
    vi.useFakeTimers()
    window.matchMedia = motion(false)
    const seen = new Set<string>()
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.9)
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
  })
})

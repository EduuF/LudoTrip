import { vi } from 'vitest'

// Nenhum teste fala com a internet: busca online e tiles respondem "sem rede".
// Um teste que precise de rede simulada troca o `fetch` com `vi.stubGlobal`.
if (typeof localStorage !== 'undefined') localStorage.setItem('ludotrip.tutorial', '1')

vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('sem rede nos testes'))),
)

import { vi } from 'vitest'

// Nenhum teste fala com a internet: busca online e tiles respondem "sem rede".
// Um teste que precise de rede simulada troca o `fetch` com `vi.stubGlobal`.
vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('sem rede nos testes'))),
)

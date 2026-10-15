import { vi } from 'vitest'

// Nenhum teste fala com a internet: busca online e tiles respondem "sem rede".
// Um teste que precise de rede simulada troca o `fetch` com `vi.stubGlobal`.
if (typeof localStorage !== 'undefined') localStorage.setItem('ludotrip.tutorial', '1')

vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.reject(new Error('sem rede nos testes'))),
)

// Esperas dos testes de interface (findBy/waitFor): com a suíte inteira rodando em paralelo, criar e
// abrir uma viagem pode passar de 1 s (o padrão); 8 s evita falso negativo sem esconder travamento.
if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react')
  configure({ asyncUtilTimeout: 8000 })
}

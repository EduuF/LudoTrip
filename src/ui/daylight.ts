// O pôr e o nascer do sol (Dia/Noite v2, aprovado no protótipo): ao trocar o tema, as cores da página
// deslizam em 2,5 s em vez de trocar de uma vez, e um véu de luz passa por cima: laranja no pôr do sol,
// dourado no nascer. As cores são tokens registrados com @property em app.css; enquanto o <html> tem a
// classe `theme-fading`, eles têm transição. O véu nunca recebe toque.
//
// Sem @property (navegador antigo), as cores trocam na hora; o véu continua (é só opacidade).

/** Duração da troca de luz (ms). */
export const FADE = 2500

const FADING = 'theme-fading'

/** A página está no meio de um pôr/nascer do sol? (o mapa espera o meio para trocar o estilo) */
export const isFading = () => document.documentElement.classList.contains(FADING)

/**
 * Começa a troca de luz e chama `flip` (que troca o tema) já com a transição ligada. Devolve uma função
 * que encerra tudo na hora; sozinha, a troca termina pelo relógio em `FADE` ms.
 */
export function startDaylight(toDark: boolean, flip: () => void): () => void {
  const root = document.documentElement
  root.classList.add(FADING)
  const veil = document.createElement('div')
  veil.className = `daylight-veil ${toDark ? 'sunset' : 'sunrise'}`
  veil.setAttribute('aria-hidden', 'true')
  document.body.appendChild(veil)
  try {
    veil.animate(
      toDark
        ? [{ opacity: 0 }, { opacity: 0.2, offset: 0.4 }, { opacity: 0.1, offset: 0.75 }, { opacity: 0 }]
        : [{ opacity: 0 }, { opacity: 0.55, offset: 0.45 }, { opacity: 0.25, offset: 0.75 }, { opacity: 0 }],
      { duration: FADE, easing: 'ease-in-out', fill: 'forwards' },
    )
  } catch {
    // efeito visual: nunca impede a troca
  }
  flip()
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    clearTimeout(timer)
    veil.remove()
    root.classList.remove(FADING)
  }
  const timer = window.setTimeout(end, FADE)
  return end
}

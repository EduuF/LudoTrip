import { isCoarse } from './pointer'
import { useEffect, useState } from 'react'
import { useApp } from '../app/store'
import { markTutorialSeen } from '../app/tutorial'

// "Como jogar" (v1): três passos com holofote sobre o mapa, a trilha e o cartão do dia.
// Aparece uma vez por aparelho; o "?" do HUD mostra de novo. Pode ser pulado a qualquer hora.

const STEPS = [
  {
    target: '.mappanel',
    title: 'O mapa da viagem',
    text: 'Toque num destino para entrar na cidade e ver as atividades de cada dia. Arraste e dê zoom à vontade; "▶ Ver a viagem" passa os dias sozinho.',
  },
  {
    target: '.trilha',
    title: 'A trilha dos dias',
    text: isCoarse()
      ? 'Os pegadores ◂▸ passam noites entre destinos. Segure um destino (meio segundo) e arraste: muda a data, a ordem, ou vai para a lixeira. Arraste pelos dias e o grupo viaja.'
      : 'Os pegadores ◂▸ passam noites entre destinos. Arraste um destino: muda a data, a ordem, ou vai para a lixeira. Clique num dia e o grupo viaja; a régua e a roda do mouse rolam a trilha.',
  },
  {
    target: '.daycard',
    title: 'O cartão do dia',
    text: 'Onde vocês estão, onde dormem e as atividades do dia, com "+ Atividade". Toque numa atividade para anotar o que quiser sobre aquele dia. Role para baixo: o roteiro, um destino aberto por vez, e as atividades do destino, que dá para pôr em quantos dias quiser. Os selos: 済 é feito ou reservado; 宿 é onde vocês dormem. Tudo tem Desfazer.',
  },
]

export function Tutorial() {
  const open = useApp((s) => s.tutorial)
  const setTutorial = useApp((s) => s.setTutorial)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const el = document.querySelector(STEPS[step]!.target)
    if (!el) {
      setRect(null)
      return
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
    const update = () => setRect(el.getBoundingClientRect())
    update()
    const t = setTimeout(update, 450)
    addEventListener('resize', update)
    addEventListener('scroll', update, true)
    return () => {
      clearTimeout(t)
      removeEventListener('resize', update)
      removeEventListener('scroll', update, true)
    }
  }, [open, step])

  // Escape fecha (como "Pular"); o foco vai para o tutorial ao abrir.
  useEffect(() => {
    if (!open) return
    document.querySelector<HTMLElement>('.tutorial button')?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      markTutorialSeen()
      setTutorial(false)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open, setTutorial])

  if (!open) return null
  const close = () => {
    markTutorialSeen()
    setTutorial(false)
  }
  const last = step === STEPS.length - 1
  const s = STEPS[step]!
  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-label="Como jogar">
      <div
        className="spot"
        style={
          rect
            ? { left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }
            : { left: 0, top: 0, width: 0, height: 0 }
        }
      />
      <div className="tut-card">
        <small>
          COMO JOGAR · {step + 1}/{STEPS.length}
        </small>
        <b>{s.title}</b>
        <p>{s.text}</p>
        <div className="row">
          <button type="button" className="btn small ghost" onClick={close}>
            Pular
          </button>
          {step > 0 ? (
            <button type="button" className="btn small ghost" onClick={() => setStep(step - 1)}>
              Voltar
            </button>
          ) : null}
          <span className="spacer" />
          <button
            type="button"
            className="btn small main"
            onClick={() => (last ? close() : setStep(step + 1))}
          >
            {last ? 'Começar' : 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  )
}

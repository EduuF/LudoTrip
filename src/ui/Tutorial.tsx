import { useEffect, useState } from 'react'
import { useApp } from '../app/store'
import { markTutorialSeen } from '../app/tutorial'

// "Como jogar" (v1): três passos com holofote sobre o mapa, a trilha e o cartão do dia.
// Aparece uma vez por aparelho; o "?" do HUD mostra de novo. Pode ser pulado a qualquer hora.

const STEPS = [
  {
    target: '.mappanel',
    title: 'O mapa da viagem',
    text: 'Toque numa fase para entrar na cidade e ver os lugares de cada dia. Arraste e dê zoom à vontade; "▶ Ver a viagem" passa os dias sozinho.',
  },
  {
    target: '.trilha',
    title: 'A trilha dos dias',
    text: 'Arraste ◆ para passar noites entre destinos. Segure um destino para mudar a data ou a ordem. Arraste pelos dias e o grupo viaja no mapa.',
  },
  {
    target: '.daycard',
    title: 'O cartão do dia',
    text: 'Onde vocês estão, onde dormem e as figurinhas do dia. Role para baixo: o roteiro inteiro, com passagens e hospedagens. Tudo tem Desfazer.',
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

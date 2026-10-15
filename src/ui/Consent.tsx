import { useState } from 'react'
import { useApp } from '../app/store'
import { getConsent, metricsAvailable, setConsent } from '../app/telemetry'

// Pergunta, uma vez, se pode medir o uso (spec publicação §5.7). Sem resposta, nada é enviado.
export function Consent() {
  const [open, setOpen] = useState(() => metricsAvailable() && getConsent() === null)
  // Nunca por cima de um painel (escondia "Receber link por e-mail" no ENTRAR): espera ele fechar.
  const sheetOpen = useApp((s) => !!s.sheet)
  if (!open || sheetOpen) return null
  const answer = (v: 'yes' | 'no') => {
    setOpen(false)
    void setConsent(v)
  }
  return (
    <div className="consent" role="dialog" aria-label="Medir o uso do app">
      <p>Podemos medir como o app é usado, sem ler suas viagens? Isso nos ajuda a deixá-lo mais fácil.</p>
      <div className="row">
        <button type="button" className="btn small main" onClick={() => answer('yes')}>
          Pode
        </button>
        <button type="button" className="btn small ghost" onClick={() => answer('no')}>
          Prefiro não
        </button>
      </div>
    </div>
  )
}

/** O mesmo, depois: um interruptor em "Sua conta". */
export function ConsentToggle() {
  const [on, setOn] = useState(() => getConsent() === 'yes')
  if (!metricsAvailable()) return null
  return (
    <label className="toggle-row">
      <span>Medir o uso do app (sem ler suas viagens)</span>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        onChange={(e) => {
          setOn(e.target.checked)
          void setConsent(e.target.checked ? 'yes' : 'no')
        }}
      />
    </label>
  )
}

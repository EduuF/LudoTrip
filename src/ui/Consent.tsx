import { useState } from 'react'
import { getConsent, metricsAvailable, setConsent } from '../app/telemetry'

// Estatísticas de uso (spec publicação §5.7): ligadas por padrão, sem pergunta. Quem quiser desliga
// aqui. Nenhum texto que a pessoa escreve entra nelas.

export function ConsentToggle() {
  const [on, setOn] = useState(() => getConsent() === 'yes')
  if (!metricsAvailable()) return null
  return (
    <label className="toggle-row">
      <span>
        <b>Estatísticas de uso</b>
        <small>Ajudam a melhorar o LudoTrip. Não incluem o que você escreve.</small>
      </span>
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

/** "Privacidade": o que fica guardado, em poucas linhas, e o interruptor das estatísticas. */
export function PrivacySheet() {
  return (
    <>
      <h2>Privacidade</h2>
      <p className="sub">
        Suas viagens ficam neste aparelho e, se você entrar numa conta, na nuvem do LudoTrip. Ninguém mais vê,
        a não ser quem você convidar.
      </p>
      <ConsentToggle />
    </>
  )
}

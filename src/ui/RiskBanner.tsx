import { useEffect, useState } from 'react'
import { useApp } from '../app/store'

// Risco real de perder as viagens do aparelho (spec publicação §3.2): o Safari do iPhone apaga os dados
// de sites não abertos por 7 dias (o app instalado não), e alguns navegadores apagam para liberar
// espaço. Um aviso gentil em "Suas viagens", com as duas saídas, no máximo a cada 3 dias.

const KEY = 'ludotrip.riskSeen'
const EVERY = 3 * 24 * 3600 * 1000

const iosSafariTab = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(navigator as { standalone?: boolean }).standalone &&
  !matchMedia?.('(display-mode: standalone)').matches

const seenRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < EVERY
  } catch {
    return false
  }
}

export function RiskBanner() {
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const account = useApp((s) => s.account)
  const hasGuest = useApp((s) => s.trips.some((t) => !t.cloud && !t.example))
  const openSignIn = useApp((s) => s.openSignIn)
  const openSheet = useApp((s) => s.openSheet)
  const [risk, setRisk] = useState<'ios' | 'evict' | null>(null)
  const [hidden, setHidden] = useState(seenRecently)

  useEffect(() => {
    if (!cloudEnabled || account || !hasGuest) return
    if (iosSafariTab()) return setRisk('ios')
    // Pede ao navegador para não apagar; se ele negar, o risco é real.
    void navigator.storage
      ?.persisted?.()
      .then((ok) => ok || navigator.storage.persist?.())
      .then((ok) => setRisk(ok === false ? 'evict' : null))
      .catch(() => undefined)
  }, [cloudEnabled, account, hasGuest])

  if (!risk || hidden || account || !hasGuest) return null
  const dismiss = () => {
    setHidden(true)
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      // ok
    }
  }
  return (
    <div className="risk-banner" role="note">
      <p>
        {risk === 'ios'
          ? 'No iPhone, o Safari apaga os dados de sites que você não abre por 7 dias. Para não perder suas viagens:'
          : 'Este navegador pode apagar suas viagens para liberar espaço. Para não perder nada:'}
      </p>
      <div className="row">
        {risk === 'ios' ? (
          <button type="button" className="btn small" onClick={() => openSheet({ kind: 'install' })}>
            Instalar o app
          </button>
        ) : null}
        <button
          type="button"
          className="btn small main"
          onClick={() => openSignIn('para guardar suas viagens')}
        >
          Entrar
        </button>
        <button type="button" className="icon-btn" aria-label="Agora não" onClick={dismiss}>
          ✕
        </button>
      </div>
    </div>
  )
}

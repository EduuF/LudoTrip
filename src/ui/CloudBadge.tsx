import { useApp } from '../app/store'

// A nuvem no topo da viagem (spec publicação §3.1, §5.4), sempre no mesmo lugar:
// - viagem só do aparelho: "☁️ Salvar", à vista (guardar não pode depender de voltar à tela inicial);
// - viagem da conta: o estado (✓ tudo salvo · ⋯ enviando · ✕ sem internet), que se explica ao tocar.

const TEXT = {
  saved: 'Tudo salvo na sua conta.',
  sending: (n: number) => `Enviando ${n === 1 ? '1 alteração' : `${n} alterações`}…`,
  offline: (n: number) =>
    n
      ? `Sem internet · ${n === 1 ? '1 alteração guardada' : `${n} alterações guardadas`} neste aparelho. Elas vão sozinhas quando a conexão voltar.`
      : 'Sem internet. O que você mudar fica guardado neste aparelho e vai sozinho quando a conexão voltar.',
}

export function CloudBadge() {
  const cloud = useApp((s) => s.cloud)
  const say = useApp((s) => s.say)
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const local = useApp((s) => !!s.doc && !s.doc.meta.cloud)
  const openSheet = useApp((s) => s.openSheet)
  if (cloudEnabled && local)
    return (
      <button
        type="button"
        className="hud-btn cloud-save"
        aria-label="Salvar na nuvem: esta viagem está só neste aparelho"
        onClick={() => openSheet({ kind: 'cloudSave' })}
      >
        ☁️ Salvar
      </button>
    )
  if (!cloud) return null
  const text =
    cloud.status === 'saved'
      ? TEXT.saved
      : cloud.status === 'sending'
        ? TEXT.sending(cloud.pending)
        : TEXT.offline(cloud.pending)
  const label =
    cloud.status === 'saved' ? 'Salvo ✓' : cloud.status === 'sending' ? 'Enviando…' : 'Sem internet'
  return (
    <button
      type="button"
      className={`hud-btn cloud-badge ${cloud.status}`}
      aria-label={text}
      title={text}
      onClick={() => say(text, cloud.status === 'offline')}
    >
      ☁️ <span aria-hidden="true">{label}</span>
    </button>
  )
}

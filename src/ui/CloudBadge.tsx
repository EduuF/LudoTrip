import { useApp } from '../app/store'

// O ícone de nuvem no topo da viagem (spec publicação §5.4): discreto, e diz o estado ao tocar.

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
  if (!cloud) return null
  const text =
    cloud.status === 'saved'
      ? TEXT.saved
      : cloud.status === 'sending'
        ? TEXT.sending(cloud.pending)
        : TEXT.offline(cloud.pending)
  const glyph = cloud.status === 'saved' ? '✓' : cloud.status === 'sending' ? '⋯' : '✕'
  return (
    <button
      type="button"
      className={`hud-btn cloud-badge ${cloud.status}`}
      aria-label={text}
      title={text}
      onClick={() => say(text, cloud.status === 'offline')}
    >
      ☁️<span aria-hidden="true">{glyph}</span>
    </button>
  )
}

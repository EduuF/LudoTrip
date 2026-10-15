import { RiskBanner } from './RiskBanner'
import { ThemeToggle } from './ThemeToggle'
import { useCallback, useEffect, useState } from 'react'
import { ALL_TRIPS } from '../engine/fixtures/trips'
import { useApp } from '../app/store'
import { PopMenu } from './kit'
import type { ExampleKey } from '../app/store'
import { cueCloud } from './stage/cues'
import { ago, inDays, ROLE_NAMES } from '../app/people'
import type { TripMeta } from '../app/doc'

// Suas viagens (com renomear e apagar), exemplos para explorar e criar viagem (spec §17.7).

const EXAMPLES: Record<ExampleKey, { title: string; text: string }> = {
  japao: { title: 'Japão de trem', text: '9 paradas, volta marcada, bate-volta a Nara' },
  rio: { title: 'Rio, uma cidade', text: '5 noites e um bate-volta a Petrópolis' },
  portugal: { title: 'Portugal de carro', text: 'road trip com carro alugado' },
  europa: { title: 'Lisboa, Paris e Roma', text: '3 países com voos no meio' },
  cruzeiro: { title: 'Cruzeiro', text: 'navio com escalas como bate-volta' },
  caminho: { title: 'Caminho de Santiago', text: 'uma noite por etapa, a pé' },
}

/** "☁️ salva na sua conta", "☁️ com 3 pessoas · Planeja junto". */
function cloudLine(t: TripMeta): string {
  const c = t.cloud!
  const n = c.members ?? 1
  const who = n > 1 ? `☁️ com ${n} pessoas` : '☁️ salva na sua conta'
  return c.role === 'owner' ? who : `${who} · ${ROLE_NAMES[c.role]}`
}

export function Home() {
  const trips = useApp((s) => s.trips)
  const cloudEnabled = useApp((s) => s.cloudEnabled)
  const account = useApp((s) => s.account)
  const openSheet = useApp((s) => s.openSheet)
  const openSignIn = useApp((s) => s.openSignIn)
  const saveToCloud = useApp((s) => s.saveToCloud)
  const justUploaded = useApp((s) => s.justUploaded)
  const openTrip = useApp((s) => s.openTrip)
  const addExample = useApp((s) => s.addExample)
  const goCreate = useApp((s) => s.goCreate)
  const removeTrip = useApp((s) => s.removeTrip)
  const renameTrip = useApp((s) => s.renameTrip)
  const leaveTrip = useApp((s) => s.leaveTrip)
  const deleted = useApp((s) => s.deleted)
  const restoreTrip = useApp((s) => s.restoreTrip)
  const [busy, setBusy] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const closeMenu = useCallback(() => {
    setMenu(null)
    setConfirm(null)
  }, [])
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  // Viagens que acabaram de subir: o cartão voa para a nuvem no primeiro delas (docs/animacoes.md).
  const firstUp = justUploaded[0]
  useEffect(() => {
    if (firstUp) cueCloud(null, document.querySelector('.trip-card.uploaded .trip-open, .trip-card.uploaded'))
  }, [firstUp])
  useEffect(() => {
    document.title = 'LudoTrip'
  }, [])
  const saveName = async () => {
    if (!editing) return
    const n = editing.name.trim()
    setEditing(null)
    if (n) await renameTrip(editing.id, n)
  }
  return (
    <div className="wrap">
      <header className="home-head">
        <div className="home-actions">
          <ThemeToggle className="btn small" />
          {cloudEnabled ? (
            account ? (
              <button
                type="button"
                className="home-account"
                aria-label={`Sua conta: ${account.name ?? account.email ?? ''}`}
                onClick={() => openSheet({ kind: 'account' })}
              >
                {account.picture ? (
                  <img src={account.picture} alt="" referrerPolicy="no-referrer" />
                ) : (
                  <span>{(account.name ?? account.email ?? '?').slice(0, 1)}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                className="btn small home-account-in"
                onClick={() => openSignIn('para guardar suas viagens')}
              >
                Entrar
              </button>
            )
          ) : null}
        </div>
        <span className="wm" aria-hidden="true">
          旅
        </span>
        <h1 className="title">
          Ludo<em>Trip</em>
        </h1>
        <p className="note">
          Planeje a viagem como quem joga: veja o mapa do lugar, arraste os destinos na trilha, marque as
          atividades de cada dia e resolva as tarefas.
        </p>
      </header>
      <RiskBanner />
      <button type="button" className="btn big main" onClick={goCreate} style={{ marginTop: 12 }}>
        Criar viagem
      </button>
      {trips.length ? (
        <>
          <h2 className="sec">Suas viagens</h2>
          <div className="trips">
            {trips.map((t) => (
              <div key={t.id} className={`trip-card${justUploaded.includes(t.id) ? ' uploaded' : ''}`}>
                {editing?.id === t.id ? (
                  <form
                    className="row"
                    style={{ flex: 1 }}
                    onSubmit={(e) => {
                      e.preventDefault()
                      void saveName()
                    }}
                  >
                    <input
                      className="input"
                      style={{ flex: 1 }}
                      value={editing.name}
                      aria-label="Nome da viagem"
                      autoFocus
                      onChange={(e) => setEditing({ id: t.id, name: e.target.value })}
                      onBlur={() => void saveName()}
                    />
                    <button type="submit" className="btn small">
                      Salvar
                    </button>
                  </form>
                ) : (
                  <button type="button" className="trip-open" onClick={() => openTrip(t.id)}>
                    <span className="seal">{t.name.slice(0, 1)}</span>
                    <span className="c-title">
                      <h3>{t.name}</h3>
                      <span className="dates">
                        {t.example
                          ? 'exemplo para mexer à vontade'
                          : t.cloud
                            ? cloudLine(t)
                            : cloudEnabled
                              ? '📱 só neste aparelho'
                              : 'sua viagem'}
                      </span>
                    </span>
                  </button>
                )}
                <div className="trip-menu">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Mais opções de ${t.name}`}
                    aria-expanded={menu === t.id}
                    onClick={() => setMenu(menu === t.id ? null : t.id)}
                  >
                    ⋯
                  </button>
                  {menu === t.id ? (
                    <PopMenu onClose={closeMenu}>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenu(null)
                          setEditing({ id: t.id, name: t.name })
                        }}
                      >
                        Renomear
                      </button>
                      {t.cloud && t.cloud.role !== 'owner' ? (
                        // Quem não é o Dono sai da viagem (ela continua para os outros).
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          onClick={() => {
                            if (confirm !== t.id) return setConfirm(t.id)
                            setMenu(null)
                            void leaveTrip(t.id)
                          }}
                        >
                          {confirm === t.id ? 'Toque de novo para sair' : 'Sair da viagem'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          role="menuitem"
                          className="danger"
                          // Segundo toque para apagar a viagem inteira (spec §17.12).
                          onClick={() => {
                            if (confirm !== t.id) return setConfirm(t.id)
                            setMenu(null)
                            void removeTrip(t.id)
                          }}
                        >
                          {confirm === t.id
                            ? (t.cloud?.members ?? 1) > 1
                              ? 'Toque de novo para apagar para todos'
                              : 'Toque de novo para apagar'
                            : 'Apagar'}
                        </button>
                      )}
                    </PopMenu>
                  ) : null}
                </div>
                {cloudEnabled && !t.cloud ? (
                  <button
                    type="button"
                    className="btn small save-cloud"
                    onClick={() => void saveToCloud(t.id)}
                  >
                    ☁️ Guardar na nuvem
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}
      {deleted.length ? (
        <>
          <h2 className="sec">
            Apagadas <small>voltam por 30 dias</small>
          </h2>
          <div className="trips">
            {deleted.map((t) => (
              <div key={t.id} className="trip-card deleted">
                <span className="c-title">
                  <h3>{t.name}</h3>
                  <span className="dates">
                    apagada {ago(t.deletedAt)} · some {inDays(t.purgeAt)}
                  </span>
                </span>
                <button type="button" className="btn small" onClick={() => void restoreTrip(t.id)}>
                  Recuperar
                </button>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <h2 className="sec">
        Explorar exemplos <small>mexa à vontade</small>
      </h2>
      <div className="examples">
        {(Object.keys(ALL_TRIPS) as ExampleKey[]).map((k) => (
          <button
            key={k}
            type="button"
            className="example"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              await addExample(k)
              setBusy(false)
            }}
          >
            <b>{EXAMPLES[k].title}</b>
            <span>{EXAMPLES[k].text}</span>
          </button>
        ))}
      </div>
      {cloudEnabled ? (
        <footer className="home-foot">
          <button type="button" className="link-btn" onClick={() => openSheet({ kind: 'privacy' })}>
            Privacidade
          </button>
        </footer>
      ) : null}
    </div>
  )
}

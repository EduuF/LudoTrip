// Os endereços do app (spec publicação §3.6), sem nada de tela: o store e os testes usam daqui.

export type Route = { kind: 'home' } | { kind: 'trip'; id: string } | { kind: 'emailLink' }

const base = () => import.meta.env.BASE_URL || '/'

export function parseRoute(pathname: string, root = base()): Route {
  const rest = pathname.startsWith(root) ? pathname.slice(root.length) : pathname.replace(/^\//, '')
  const trip = /^v\/([^/]+)\/?$/.exec(rest)
  if (trip) return { kind: 'trip', id: decodeURIComponent(trip[1]!) }
  if (/^entrar\/link\/?$/.test(rest)) return { kind: 'emailLink' }
  return { kind: 'home' }
}

export function formatRoute(route: Route, root = base()): string {
  if (route.kind === 'trip') return `${root}v/${encodeURIComponent(route.id)}`
  if (route.kind === 'emailLink') return `${root}entrar/link`
  return root
}

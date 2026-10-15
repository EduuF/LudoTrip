// www.ludotrip.app leva para ludotrip.app, mantendo o caminho e a busca (wrangler.www.jsonc).
export function toApex(href: string): string {
  const url = new URL(href)
  url.hostname = url.hostname.replace(/^www\./, '')
  url.protocol = 'https:'
  return url.href
}

export default {
  fetch: (request) => Response.redirect(toApex(request.url), 301),
} satisfies ExportedHandler

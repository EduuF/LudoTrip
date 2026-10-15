// O Photon não fala português (só default, de, en, fr). Pedimos em inglês e passamos o nome por
// aqui: primeiro os marcos com nome consagrado em português, depois o termo genérico vai para a
// frente ("Uminomori Park" → "Parque Uminomori"). Sem regra que sirva, o nome fica como veio.

/** Marcos famosos: o nome inglês (sem diferença de maiúsculas) → o nome usado no Brasil. */
const MARCOS: Record<string, string> = {
  'christ the redeemer': 'Cristo Redentor',
  'sugarloaf mountain': 'Pão de Açúcar',
  'eiffel tower': 'Torre Eiffel',
  'arc de triomphe': 'Arco do Triunfo',
  'louvre museum': 'Museu do Louvre',
  'notre-dame cathedral': 'Catedral de Notre-Dame',
  'statue of liberty': 'Estátua da Liberdade',
  'empire state building': 'Empire State Building',
  'central park': 'Central Park',
  'times square': 'Times Square',
  'golden gate bridge': 'Ponte Golden Gate',
  colosseum: 'Coliseu',
  'roman forum': 'Fórum Romano',
  'trevi fountain': 'Fontana di Trevi',
  pantheon: 'Panteão',
  "st. peter's basilica": 'Basílica de São Pedro',
  "saint peter's basilica": 'Basílica de São Pedro',
  "st. peter's square": 'Praça de São Pedro',
  'sistine chapel': 'Capela Sistina',
  'vatican museums': 'Museus Vaticanos',
  'leaning tower of pisa': 'Torre de Pisa',
  'big ben': 'Big Ben',
  'tower of london': 'Torre de Londres',
  'tower bridge': 'Tower Bridge',
  'buckingham palace': 'Palácio de Buckingham',
  'british museum': 'Museu Britânico',
  'brandenburg gate': 'Portão de Brandemburgo',
  'berlin wall': 'Muro de Berlim',
  'sagrada familia': 'Sagrada Família',
  acropolis: 'Acrópole',
  parthenon: 'Partenon',
  'great wall of china': 'Muralha da China',
  'forbidden city': 'Cidade Proibida',
  'tiananmen square': 'Praça da Paz Celestial',
  'imperial palace': 'Palácio Imperial',
  'tokyo imperial palace': 'Palácio Imperial de Tóquio',
  'mount fuji': 'Monte Fuji',
  'golden pavilion': 'Pavilhão Dourado',
  'silver pavilion': 'Pavilhão Prateado',
  'great buddha': 'Grande Buda',
  'taj mahal': 'Taj Mahal',
  'great pyramid of giza': 'Grande Pirâmide de Gizé',
  'pyramids of giza': 'Pirâmides de Gizé',
  sphinx: 'Esfinge',
  'great sphinx of giza': 'Grande Esfinge de Gizé',
  'sydney opera house': 'Ópera de Sydney',
  'niagara falls': 'Cataratas do Niágara',
  'iguazu falls': 'Cataratas do Iguaçu',
  'grand canyon': 'Grand Canyon',
  'machu picchu': 'Machu Picchu',
  'dead sea': 'Mar Morto',
  'western wall': 'Muro das Lamentações',
}

/** "X Termo" → "Pt X". Do mais específico ao mais geral: o primeiro que casar vence. */
const SUFIXOS: [string, string][] = [
  ['National Park', 'Parque Nacional'],
  ['Botanical Garden', 'Jardim Botânico'],
  ['Botanical Gardens', 'Jardim Botânico'],
  ['Amusement Park', 'Parque de Diversões'],
  ['Theme Park', 'Parque Temático'],
  ['Art Museum', 'Museu de Arte'],
  ['Museum of Art', 'Museu de Arte'],
  ['International Airport', 'Aeroporto Internacional'],
  ['Railway Station', 'Estação'],
  ['Train Station', 'Estação'],
  ['Bus Terminal', 'Terminal Rodoviário'],
  ['Shopping Center', 'Shopping'],
  ['Shopping Mall', 'Shopping'],
  ['Park', 'Parque'],
  ['Gardens', 'Jardim'],
  ['Garden', 'Jardim'],
  ['Temple', 'Templo'],
  ['Shrine', 'Santuário'],
  // Sufixos japoneses comuns em nomes de santuário e templo.
  ['Taisha', 'Santuário'],
  ['Jingu', 'Santuário'],
  ['Jingū', 'Santuário'],
  ['Jinja', 'Santuário'],
  ['Dera', 'Templo'],
  ['Station', 'Estação'],
  ['Castle', 'Castelo'],
  ['Museum', 'Museu'],
  ['Tower', 'Torre'],
  ['Bridge', 'Ponte'],
  ['Lake', 'Lago'],
  ['Mountain', 'Montanha'],
  ['Hill', 'Morro'],
  ['Island', 'Ilha'],
  ['Islands', 'Ilhas'],
  ['Beach', 'Praia'],
  ['Market', 'Mercado'],
  ['Palace', 'Palácio'],
  ['Airport', 'Aeroporto'],
  ['Zoo', 'Zoológico'],
  ['Aquarium', 'Aquário'],
  ['Cathedral', 'Catedral'],
  ['Basilica', 'Basílica'],
  ['Church', 'Igreja'],
  ['Chapel', 'Capela'],
  ['Monastery', 'Mosteiro'],
  ['Bay', 'Baía'],
  ['River', 'Rio'],
  ['Waterfall', 'Cachoeira'],
  ['Falls', 'Cataratas'],
  ['Waterway', 'Canal'],
  ['Canal', 'Canal'],
  ['Square', 'Praça'],
  ['Street', 'Rua'],
  ['Avenue', 'Avenida'],
  ['Pier', 'Píer'],
  ['Port', 'Porto'],
  ['Harbor', 'Porto'],
  ['Harbour', 'Porto'],
  ['Stadium', 'Estádio'],
  ['Theatre', 'Teatro'],
  ['Theater', 'Teatro'],
  ['University', 'Universidade'],
  ['Library', 'Biblioteca'],
  ['Observatory', 'Observatório'],
  ['Observation Deck', 'Mirante'],
  ['Lookout', 'Mirante'],
  ['Viewpoint', 'Mirante'],
  ['Hot Spring', 'Fonte Termal'],
  ['Hot Springs', 'Fontes Termais'],
  ['Forest', 'Floresta'],
  ['Valley', 'Vale'],
  ['Cave', 'Caverna'],
  ['Pagoda', 'Pagode'],
  ['Gate', 'Portão'],
]

/** "Termo X" → "Pt X". */
const PREFIXOS: [string, string][] = [
  ['Museum of', 'Museu de'],
  ['Church of', 'Igreja de'],
  ['Cathedral of', 'Catedral de'],
  ['Palace of', 'Palácio de'],
  ['University of', 'Universidade de'],
  ['Port of', 'Porto de'],
  ['Mount', 'Monte'],
  ['Mt.', 'Monte'],
  ['Lake', 'Lago'],
  ['Cape', 'Cabo'],
]

/** Ligações que sobram em volta de um marco trocado ("Cristo Redentor of the Andes"). */
const PALAVRAS: Record<string, string> = { the: '', of: 'de', and: 'e' }

/** Do mais longo ao mais curto: "tokyo imperial palace" antes de "imperial palace". */
const MARCOS_DO_MAIOR = Object.entries(MARCOS).sort((a, b) => b[0].length - a[0].length)

const limpa = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Cidades com nome próprio em português (o Photon devolve em inglês). */
const CIDADES: Record<string, string> = {
  tokyo: 'Tóquio',
  'new york': 'Nova York',
  'new york city': 'Nova York',
  london: 'Londres',
  lisbon: 'Lisboa',
  madrid: 'Madri',
  seville: 'Sevilha',
  edinburgh: 'Edimburgo',
  amsterdam: 'Amsterdã',
  brussels: 'Bruxelas',
  berlin: 'Berlim',
  munich: 'Munique',
  hamburg: 'Hamburgo',
  cologne: 'Colônia',
  vienna: 'Viena',
  prague: 'Praga',
  budapest: 'Budapeste',
  warsaw: 'Varsóvia',
  zurich: 'Zurique',
  geneva: 'Genebra',
  rome: 'Roma',
  florence: 'Florença',
  venice: 'Veneza',
  milan: 'Milão',
  naples: 'Nápoles',
  turin: 'Turim',
  athens: 'Atenas',
  istanbul: 'Istambul',
  copenhagen: 'Copenhague',
  stockholm: 'Estocolmo',
  moscow: 'Moscou',
  'saint petersburg': 'São Petersburgo',
  bucharest: 'Bucareste',
  constanta: 'Constança',
  seoul: 'Seul',
  beijing: 'Pequim',
  shanghai: 'Xangai',
  hanoi: 'Hanói',
  singapore: 'Singapura',
  'new delhi': 'Nova Délhi',
  jerusalem: 'Jerusalém',
  'cape town': 'Cidade do Cabo',
  'mexico city': 'Cidade do México',
  montevideo: 'Montevidéu',
  'buenos aires': 'Buenos Aires',
  philadelphia: 'Filadélfia',
  'new orleans': 'Nova Orleans',
}

/** Nome de cidade em português, quando a gente conhece; senão, o próprio nome. */
export function cidadePt(nome: string): string {
  return CIDADES[limpa(nome).toLowerCase()] ?? nome
}

/** O que sobra do nome depois de tirar o termo genérico: cidade conhecida vira "de Tóquio". */
const resto = (r: string) => {
  const c = CIDADES[r.toLowerCase()]
  return c ? `de ${c}` : r
}

export function aportuguesar(nome: string): string {
  const n = limpa(nome)
  if (!n) return nome
  const exato = MARCOS[n.toLowerCase()] ?? CIDADES[n.toLowerCase()]
  if (exato) return exato
  // Marco famoso dentro de um nome maior ("Christ the Redeemer of the Andes").
  for (const [en, pt] of MARCOS_DO_MAIOR) {
    const i = n.toLowerCase().indexOf(en)
    if (i >= 0 && en.length >= 6) {
      const trocado = limpa(
        (n.slice(0, i) + pt + n.slice(i + en.length)).replace(
          /\b(the|of|and)\b/gi,
          (w) => PALAVRAS[w.toLowerCase()] ?? w,
        ),
      )
      // Sobrou um termo genérico depois do marco? ("Cristo Redentor Hill" → "Morro Cristo Redentor").
      return trocado.endsWith(pt) ? trocado : generico(trocado)
    }
  }
  return generico(n)
}

/** "X Termo" → "Pt X" e "Termo X" → "Pt X"; sem regra que sirva, devolve igual. */
function generico(n: string): string {
  const baixo = n.toLowerCase()
  for (const [en, pt] of SUFIXOS) {
    // Separado por espaço ou hífen ("Fushimi Inari-taisha").
    const t = en.toLowerCase()
    const sep = baixo.length > t.length + 1 ? baixo[baixo.length - t.length - 1] : ''
    if ((sep === ' ' || sep === '-') && baixo.endsWith(t))
      return `${pt} ${resto(n.slice(0, -t.length - 1).trim())}`
  }
  for (const [en, pt] of PREFIXOS) {
    const ini = `${en.toLowerCase()} `
    if (baixo.length > ini.length && baixo.startsWith(ini)) return `${pt} ${n.slice(ini.length).trim()}`
  }
  return n
}

// Países em português, para "Para onde?" aceitar um país (escopo da viagem) e para dar nome ao mapa.
// `id` é o código numérico ISO 3166-1 usado pelo world-atlas (contornos e caixa envolvente).

export interface Country {
  /** Código numérico ISO 3166-1, como no world-atlas ("392"). */
  id: string
  /** ISO 3166-1 alpha-2 ("JP"). */
  iso2: string
  name: string
  /** Nome na escrita local, quando difere. */
  localName?: string
}

const c = (id: string, iso2: string, name: string, localName?: string): Country => ({
  id,
  iso2,
  name,
  ...(localName ? { localName } : {}),
})

export const COUNTRIES: Country[] = [
  c('004', 'AF', 'Afeganistão'),
  c('710', 'ZA', 'África do Sul'),
  c('008', 'AL', 'Albânia', 'Shqipëri'),
  c('276', 'DE', 'Alemanha', 'Deutschland'),
  c('020', 'AD', 'Andorra'),
  c('024', 'AO', 'Angola'),
  c('660', 'AI', 'Anguilla'),
  c('028', 'AG', 'Antígua e Barbuda'),
  c('682', 'SA', 'Arábia Saudita', 'السعودية'),
  c('012', 'DZ', 'Argélia', 'الجزائر'),
  c('032', 'AR', 'Argentina'),
  c('051', 'AM', 'Armênia', 'Հայաստան'),
  c('533', 'AW', 'Aruba'),
  c('036', 'AU', 'Austrália'),
  c('040', 'AT', 'Áustria', 'Österreich'),
  c('031', 'AZ', 'Azerbaijão'),
  c('044', 'BS', 'Bahamas'),
  c('048', 'BH', 'Bahrein', 'البحرين'),
  c('050', 'BD', 'Bangladesh', 'বাংলাদেশ'),
  c('052', 'BB', 'Barbados'),
  c('056', 'BE', 'Bélgica'),
  c('084', 'BZ', 'Belize'),
  c('204', 'BJ', 'Benim'),
  c('060', 'BM', 'Bermudas'),
  c('112', 'BY', 'Belarus', 'Беларусь'),
  c('068', 'BO', 'Bolívia'),
  c('070', 'BA', 'Bósnia e Herzegovina'),
  c('072', 'BW', 'Botsuana'),
  c('076', 'BR', 'Brasil'),
  c('096', 'BN', 'Brunei'),
  c('100', 'BG', 'Bulgária', 'България'),
  c('854', 'BF', 'Burkina Faso'),
  c('108', 'BI', 'Burundi'),
  c('064', 'BT', 'Butão', 'འབྲུག'),
  c('132', 'CV', 'Cabo Verde'),
  c('120', 'CM', 'Camarões'),
  c('116', 'KH', 'Camboja', 'កម្ពុជា'),
  c('124', 'CA', 'Canadá'),
  c('634', 'QA', 'Catar', 'قطر'),
  c('398', 'KZ', 'Cazaquistão'),
  c('148', 'TD', 'Chade'),
  c('152', 'CL', 'Chile'),
  c('156', 'CN', 'China', '中国'),
  c('196', 'CY', 'Chipre'),
  c('170', 'CO', 'Colômbia'),
  c('174', 'KM', 'Comores'),
  c('178', 'CG', 'Congo'),
  c('408', 'KP', 'Coreia do Norte', '조선'),
  c('410', 'KR', 'Coreia do Sul', '한국'),
  c('384', 'CI', 'Costa do Marfim'),
  c('188', 'CR', 'Costa Rica'),
  c('191', 'HR', 'Croácia', 'Hrvatska'),
  c('192', 'CU', 'Cuba'),
  c('531', 'CW', 'Curaçao'),
  c('208', 'DK', 'Dinamarca', 'Danmark'),
  c('262', 'DJ', 'Djibuti'),
  c('212', 'DM', 'Dominica'),
  c('818', 'EG', 'Egito', 'مصر'),
  c('222', 'SV', 'El Salvador'),
  c('784', 'AE', 'Emirados Árabes Unidos', 'الإمارات'),
  c('218', 'EC', 'Equador'),
  c('232', 'ER', 'Eritreia'),
  c('703', 'SK', 'Eslováquia', 'Slovensko'),
  c('705', 'SI', 'Eslovênia', 'Slovenija'),
  c('724', 'ES', 'Espanha', 'España'),
  c('748', 'SZ', 'Essuatíni'),
  c('840', 'US', 'Estados Unidos'),
  c('233', 'EE', 'Estônia', 'Eesti'),
  c('231', 'ET', 'Etiópia'),
  c('242', 'FJ', 'Fiji'),
  c('608', 'PH', 'Filipinas'),
  c('246', 'FI', 'Finlândia', 'Suomi'),
  c('250', 'FR', 'França', 'France'),
  c('266', 'GA', 'Gabão'),
  c('270', 'GM', 'Gâmbia'),
  c('288', 'GH', 'Gana'),
  c('268', 'GE', 'Geórgia', 'საქართველო'),
  c('308', 'GD', 'Granada'),
  c('300', 'GR', 'Grécia', 'Ελλάδα'),
  c('304', 'GL', 'Groenlândia', 'Kalaallit Nunaat'),
  c('316', 'GU', 'Guam'),
  c('320', 'GT', 'Guatemala'),
  c('831', 'GG', 'Guernsey'),
  c('328', 'GY', 'Guiana'),
  c('324', 'GN', 'Guiné'),
  c('624', 'GW', 'Guiné-Bissau'),
  c('226', 'GQ', 'Guiné Equatorial'),
  c('332', 'HT', 'Haiti'),
  c('340', 'HN', 'Honduras'),
  c('344', 'HK', 'Hong Kong', '香港'),
  c('348', 'HU', 'Hungria', 'Magyarország'),
  c('887', 'YE', 'Iêmen', 'اليمن'),
  c('136', 'KY', 'Ilhas Cayman'),
  c('184', 'CK', 'Ilhas Cook'),
  c('234', 'FO', 'Ilhas Faroé'),
  c('238', 'FK', 'Ilhas Malvinas'),
  c('580', 'MP', 'Ilhas Marianas do Norte'),
  c('584', 'MH', 'Ilhas Marshall'),
  c('090', 'SB', 'Ilhas Salomão'),
  c('092', 'VG', 'Ilhas Virgens Britânicas'),
  c('850', 'VI', 'Ilhas Virgens Americanas'),
  c('356', 'IN', 'Índia', 'भारत'),
  c('360', 'ID', 'Indonésia'),
  c('364', 'IR', 'Irã', 'ایران'),
  c('368', 'IQ', 'Iraque', 'العراق'),
  c('372', 'IE', 'Irlanda', 'Éire'),
  c('352', 'IS', 'Islândia', 'Ísland'),
  c('376', 'IL', 'Israel', 'ישראל'),
  c('380', 'IT', 'Itália', 'Italia'),
  c('388', 'JM', 'Jamaica'),
  c('392', 'JP', 'Japão', '日本'),
  c('832', 'JE', 'Jersey'),
  c('400', 'JO', 'Jordânia', 'الأردن'),
  c('296', 'KI', 'Kiribati'),
  c('414', 'KW', 'Kuwait', 'الكويت'),
  c('418', 'LA', 'Laos', 'ລາວ'),
  c('426', 'LS', 'Lesoto'),
  c('428', 'LV', 'Letônia', 'Latvija'),
  c('422', 'LB', 'Líbano', 'لبنان'),
  c('430', 'LR', 'Libéria'),
  c('434', 'LY', 'Líbia', 'ليبيا'),
  c('438', 'LI', 'Liechtenstein'),
  c('440', 'LT', 'Lituânia', 'Lietuva'),
  c('442', 'LU', 'Luxemburgo'),
  c('446', 'MO', 'Macau', '澳門'),
  c('807', 'MK', 'Macedônia do Norte'),
  c('450', 'MG', 'Madagascar'),
  c('458', 'MY', 'Malásia'),
  c('454', 'MW', 'Malaui'),
  c('462', 'MV', 'Maldivas'),
  c('466', 'ML', 'Mali'),
  c('470', 'MT', 'Malta'),
  c('504', 'MA', 'Marrocos', 'المغرب'),
  c('480', 'MU', 'Maurício'),
  c('478', 'MR', 'Mauritânia'),
  c('484', 'MX', 'México'),
  c('104', 'MM', 'Mianmar', 'မြန်မာ'),
  c('583', 'FM', 'Micronésia'),
  c('508', 'MZ', 'Moçambique'),
  c('498', 'MD', 'Moldávia'),
  c('492', 'MC', 'Mônaco'),
  c('496', 'MN', 'Mongólia', 'Монгол'),
  c('499', 'ME', 'Montenegro', 'Crna Gora'),
  c('500', 'MS', 'Montserrat'),
  c('516', 'NA', 'Namíbia'),
  c('520', 'NR', 'Nauru'),
  c('524', 'NP', 'Nepal', 'नेपाल'),
  c('558', 'NI', 'Nicarágua'),
  c('562', 'NE', 'Níger'),
  c('566', 'NG', 'Nigéria'),
  c('570', 'NU', 'Niue'),
  c('578', 'NO', 'Noruega', 'Norge'),
  c('540', 'NC', 'Nova Caledônia'),
  c('554', 'NZ', 'Nova Zelândia', 'Aotearoa'),
  c('512', 'OM', 'Omã', 'عُمان'),
  c('528', 'NL', 'Países Baixos', 'Nederland'),
  c('585', 'PW', 'Palau'),
  c('275', 'PS', 'Palestina', 'فلسطين'),
  c('591', 'PA', 'Panamá'),
  c('598', 'PG', 'Papua-Nova Guiné'),
  c('586', 'PK', 'Paquistão', 'پاکستان'),
  c('600', 'PY', 'Paraguai'),
  c('604', 'PE', 'Peru'),
  c('258', 'PF', 'Polinésia Francesa'),
  c('616', 'PL', 'Polônia', 'Polska'),
  c('630', 'PR', 'Porto Rico'),
  c('620', 'PT', 'Portugal'),
  c('404', 'KE', 'Quênia'),
  c('417', 'KG', 'Quirguistão'),
  c('826', 'GB', 'Reino Unido'),
  c('140', 'CF', 'República Centro-Africana'),
  c('180', 'CD', 'República Democrática do Congo'),
  c('214', 'DO', 'República Dominicana'),
  c('642', 'RO', 'Romênia', 'România'),
  c('646', 'RW', 'Ruanda'),
  c('643', 'RU', 'Rússia', 'Россия'),
  c('732', 'EH', 'Saara Ocidental'),
  c('882', 'WS', 'Samoa'),
  c('016', 'AS', 'Samoa Americana'),
  c('674', 'SM', 'San Marino'),
  c('654', 'SH', 'Santa Helena'),
  c('662', 'LC', 'Santa Lúcia'),
  c('659', 'KN', 'São Cristóvão e Névis'),
  c('678', 'ST', 'São Tomé e Príncipe'),
  c('670', 'VC', 'São Vicente e Granadinas'),
  c('690', 'SC', 'Seicheles'),
  c('686', 'SN', 'Senegal'),
  c('694', 'SL', 'Serra Leoa'),
  c('688', 'RS', 'Sérvia', 'Србија'),
  c('702', 'SG', 'Singapura'),
  c('760', 'SY', 'Síria', 'سوريا'),
  c('706', 'SO', 'Somália'),
  c('144', 'LK', 'Sri Lanka', 'ශ්‍රී ලංකා'),
  c('729', 'SD', 'Sudão', 'السودان'),
  c('728', 'SS', 'Sudão do Sul'),
  c('752', 'SE', 'Suécia', 'Sverige'),
  c('756', 'CH', 'Suíça', 'Schweiz'),
  c('740', 'SR', 'Suriname'),
  c('762', 'TJ', 'Tajiquistão'),
  c('764', 'TH', 'Tailândia', 'ไทย'),
  c('158', 'TW', 'Taiwan', '台灣'),
  c('834', 'TZ', 'Tanzânia'),
  c('203', 'CZ', 'Tchéquia', 'Česko'),
  c('626', 'TL', 'Timor-Leste'),
  c('768', 'TG', 'Togo'),
  c('776', 'TO', 'Tonga'),
  c('780', 'TT', 'Trinidad e Tobago'),
  c('788', 'TN', 'Tunísia', 'تونس'),
  c('795', 'TM', 'Turcomenistão'),
  c('796', 'TC', 'Turks e Caicos'),
  c('792', 'TR', 'Turquia', 'Türkiye'),
  c('804', 'UA', 'Ucrânia', 'Україна'),
  c('800', 'UG', 'Uganda'),
  c('858', 'UY', 'Uruguai'),
  c('860', 'UZ', 'Uzbequistão'),
  c('548', 'VU', 'Vanuatu'),
  c('336', 'VA', 'Vaticano'),
  c('862', 'VE', 'Venezuela'),
  c('704', 'VN', 'Vietnã', 'Việt Nam'),
  c('894', 'ZM', 'Zâmbia'),
  c('716', 'ZW', 'Zimbábue'),
]

/** Outros nomes pelos quais as pessoas procuram. */
const ALIASES: Record<string, string> = {
  eua: 'US',
  'estados unidos da america': 'US',
  america: 'US',
  inglaterra: 'GB',
  escocia: 'GB',
  'gra bretanha': 'GB',
  holanda: 'NL',
  'republica tcheca': 'CZ',
  'nova zelandia': 'NZ',
  birmania: 'MM',
  suazilandia: 'SZ',
  macedonia: 'MK',
  coreia: 'KR',
  turquia: 'TR',
  vietnam: 'VN',
}

export const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const byIso = new Map(COUNTRIES.map((x) => [x.iso2, x]))

export function countryByIso(iso2: string | undefined): Country | undefined {
  return iso2 ? byIso.get(iso2.toUpperCase()) : undefined
}

/** Busca por nome em português (sem acentos), nome local ou apelido; exatos e curtos primeiro. */
export function searchCountries(q: string, limit = 6): Country[] {
  const t = fold(q)
  if (t.length < 2) return []
  const out = new Set<Country>()
  const alias = ALIASES[t]
  if (alias) {
    const hit = byIso.get(alias)
    if (hit) out.add(hit)
  }
  const scored = COUNTRIES.map((x) => {
    const n = fold(x.name)
    const l = x.localName ? fold(x.localName) : ''
    const score =
      n === t ? 0 : n.startsWith(t) ? 1 : l.startsWith(t) ? 2 : n.includes(t) ? 3 : l.includes(t) ? 4 : -1
    return { x, score }
  })
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score || a.x.name.length - b.x.name.length)
  for (const s of scored) out.add(s.x)
  return [...out].slice(0, limit)
}

/** Caixa envolvente [oeste, sul, leste, norte] pelos contornos do world-atlas (carregados sob demanda). */
export async function countryBounds(id: string): Promise<[number, number, number, number] | null> {
  const [{ default: world }, { feature }, { geoBounds }] = await Promise.all([
    import('world-atlas/countries-50m.json'),
    import('topojson-client'),
    import('d3-geo'),
  ])
  type Topo = import('topojson-specification').Topology<{
    countries: import('topojson-specification').GeometryCollection
  }>
  const topo = world as unknown as Topo
  const feats = (
    feature(topo, topo.objects.countries) as import('geojson').FeatureCollection
  ).features.filter((f) => String(f.id) === id)
  if (!feats.length) return null
  let w = Infinity
  let s = Infinity
  let e = -Infinity
  let n = -Infinity
  for (const f of feats) {
    const [[x0, y0], [x1, y1]] = geoBounds(f)
    // Países que cruzam a linha de data (Rússia, Fiji) ficariam com o mundo todo: fica só a parte principal.
    if (x1 - x0 > 180) continue
    w = Math.min(w, x0)
    s = Math.min(s, y0)
    e = Math.max(e, x1)
    n = Math.max(n, y1)
  }
  return Number.isFinite(w) ? [w, s, e, n] : null
}

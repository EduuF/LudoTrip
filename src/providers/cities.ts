// Lista própria de cidades, para criar viagens sem internet (e como plano B do Photon).
// Coordenadas aproximadas: servem para o tabuleiro e para estimar trechos.

export interface City {
  name: string
  localName?: string
  country: string
  lat: number
  lon: number
  tz: string
}

const c = (
  name: string,
  country: string,
  lat: number,
  lon: number,
  tz: string,
  localName?: string,
): City => ({
  name,
  country,
  lat,
  lon,
  tz,
  ...(localName ? { localName } : {}),
})

const SP = 'America/Sao_Paulo'

export const CITIES: City[] = [
  // Brasil
  c('São Paulo', 'BR', -23.55, -46.63, SP),
  c('Rio de Janeiro', 'BR', -22.91, -43.17, SP),
  c('Belo Horizonte', 'BR', -19.92, -43.94, SP),
  c('Brasília', 'BR', -15.79, -47.88, SP),
  c('Salvador', 'BR', -12.97, -38.5, 'America/Bahia'),
  c('Recife', 'BR', -8.05, -34.88, 'America/Recife'),
  c('Fortaleza', 'BR', -3.72, -38.54, 'America/Fortaleza'),
  c('Natal', 'BR', -5.79, -35.21, 'America/Fortaleza'),
  c('Maceió', 'BR', -9.67, -35.74, 'America/Maceio'),
  c('Jericoacoara', 'BR', -2.79, -40.51, 'America/Fortaleza'),
  c('Fernando de Noronha', 'BR', -3.85, -32.42, 'America/Noronha'),
  c('Porto Seguro', 'BR', -16.45, -39.06, 'America/Bahia'),
  c('Florianópolis', 'BR', -27.6, -48.55, SP),
  c('Porto Alegre', 'BR', -30.03, -51.23, SP),
  c('Gramado', 'BR', -29.38, -50.87, SP),
  c('Curitiba', 'BR', -25.43, -49.27, SP),
  c('Foz do Iguaçu', 'BR', -25.55, -54.59, SP),
  c('Bonito', 'BR', -21.13, -56.48, 'America/Campo_Grande'),
  c('Manaus', 'BR', -3.12, -60.02, 'America/Manaus'),
  c('Petrópolis', 'BR', -22.51, -43.18, SP),
  c('Paraty', 'BR', -23.22, -44.71, SP),
  c('Ouro Preto', 'BR', -20.39, -43.5, SP),
  // América do Sul
  c('Buenos Aires', 'AR', -34.6, -58.38, 'America/Argentina/Buenos_Aires'),
  c('Bariloche', 'AR', -41.13, -71.31, 'America/Argentina/Salta'),
  c('Mendoza', 'AR', -32.89, -68.83, 'America/Argentina/Mendoza'),
  c('Santiago', 'CL', -33.45, -70.67, 'America/Santiago'),
  c('Montevidéu', 'UY', -34.9, -56.16, 'America/Montevideo'),
  c('Lima', 'PE', -12.05, -77.04, 'America/Lima'),
  c('Cusco', 'PE', -13.53, -71.97, 'America/Lima'),
  c('Bogotá', 'CO', 4.71, -74.07, 'America/Bogota'),
  c('Cartagena', 'CO', 10.39, -75.51, 'America/Bogota'),
  // América do Norte e Caribe
  c('Nova York', 'US', 40.71, -74.01, 'America/New_York'),
  c('Orlando', 'US', 28.54, -81.38, 'America/New_York'),
  c('Miami', 'US', 25.76, -80.19, 'America/New_York'),
  c('Los Angeles', 'US', 34.05, -118.24, 'America/Los_Angeles'),
  c('San Francisco', 'US', 37.77, -122.42, 'America/Los_Angeles'),
  c('Las Vegas', 'US', 36.17, -115.14, 'America/Los_Angeles'),
  c('Toronto', 'CA', 43.65, -79.38, 'America/Toronto'),
  c('Cidade do México', 'MX', 19.43, -99.13, 'America/Mexico_City'),
  c('Cancún', 'MX', 21.16, -86.85, 'America/Cancun'),
  // Europa
  c('Lisboa', 'PT', 38.72, -9.14, 'Europe/Lisbon'),
  c('Porto', 'PT', 41.15, -8.61, 'Europe/Lisbon'),
  c('Sintra', 'PT', 38.8, -9.39, 'Europe/Lisbon'),
  c('Madri', 'ES', 40.42, -3.7, 'Europe/Madrid', 'Madrid'),
  c('Barcelona', 'ES', 41.39, 2.17, 'Europe/Madrid'),
  c('Sevilha', 'ES', 37.39, -5.98, 'Europe/Madrid', 'Sevilla'),
  c('Paris', 'FR', 48.86, 2.35, 'Europe/Paris'),
  c('Nice', 'FR', 43.7, 7.27, 'Europe/Paris'),
  c('Londres', 'GB', 51.51, -0.13, 'Europe/London', 'London'),
  c('Edimburgo', 'GB', 55.95, -3.19, 'Europe/London', 'Edinburgh'),
  c('Dublin', 'IE', 53.35, -6.26, 'Europe/Dublin'),
  c('Amsterdã', 'NL', 52.37, 4.9, 'Europe/Amsterdam', 'Amsterdam'),
  c('Bruxelas', 'BE', 50.85, 4.35, 'Europe/Brussels', 'Bruxelles'),
  c('Berlim', 'DE', 52.52, 13.4, 'Europe/Berlin', 'Berlin'),
  c('Munique', 'DE', 48.14, 11.58, 'Europe/Berlin', 'München'),
  c('Viena', 'AT', 48.21, 16.37, 'Europe/Vienna', 'Wien'),
  c('Praga', 'CZ', 50.08, 14.44, 'Europe/Prague', 'Praha'),
  c('Budapeste', 'HU', 47.5, 19.04, 'Europe/Budapest', 'Budapest'),
  c('Zurique', 'CH', 47.38, 8.54, 'Europe/Zurich', 'Zürich'),
  c('Interlaken', 'CH', 46.69, 7.86, 'Europe/Zurich'),
  c('Roma', 'IT', 41.9, 12.5, 'Europe/Rome'),
  c('Florença', 'IT', 43.77, 11.26, 'Europe/Rome', 'Firenze'),
  c('Veneza', 'IT', 45.44, 12.32, 'Europe/Rome', 'Venezia'),
  c('Milão', 'IT', 45.46, 9.19, 'Europe/Rome', 'Milano'),
  c('Nápoles', 'IT', 40.85, 14.27, 'Europe/Rome', 'Napoli'),
  c('Atenas', 'GR', 37.98, 23.73, 'Europe/Athens', 'Αθήνα'),
  c('Santorini', 'GR', 36.39, 25.46, 'Europe/Athens', 'Σαντορίνη'),
  c('Istambul', 'TR', 41.01, 28.98, 'Europe/Istanbul', 'İstanbul'),
  c('Copenhague', 'DK', 55.68, 12.57, 'Europe/Copenhagen', 'København'),
  c('Estocolmo', 'SE', 59.33, 18.07, 'Europe/Stockholm', 'Stockholm'),
  c('Reykjavík', 'IS', 64.15, -21.94, 'Atlantic/Reykjavik'),
  c('Bucareste', 'RO', 44.43, 26.1, 'Europe/Bucharest', 'București'),
  c('Brașov', 'RO', 45.65, 25.6, 'Europe/Bucharest'),
  c('Sibiu', 'RO', 45.8, 24.15, 'Europe/Bucharest'),
  c('Cluj-Napoca', 'RO', 46.77, 23.6, 'Europe/Bucharest'),
  c('Timișoara', 'RO', 45.75, 21.23, 'Europe/Bucharest'),
  c('Constança', 'RO', 44.18, 28.63, 'Europe/Bucharest', 'Constanța'),
  // Ásia e Oriente Médio
  c('Tóquio', 'JP', 35.68, 139.77, 'Asia/Tokyo', '東京'),
  c('Kyoto', 'JP', 35.01, 135.77, 'Asia/Tokyo', '京都'),
  c('Osaka', 'JP', 34.69, 135.5, 'Asia/Tokyo', '大阪'),
  c('Nara', 'JP', 34.68, 135.84, 'Asia/Tokyo', '奈良'),
  c('Hiroshima', 'JP', 34.39, 132.46, 'Asia/Tokyo', '広島'),
  c('Sapporo', 'JP', 43.06, 141.35, 'Asia/Tokyo', '札幌'),
  c('Hakone', 'JP', 35.23, 139.11, 'Asia/Tokyo', '箱根'),
  c('Seul', 'KR', 37.57, 126.98, 'Asia/Seoul', '서울'),
  c('Pequim', 'CN', 39.9, 116.41, 'Asia/Shanghai', '北京'),
  c('Xangai', 'CN', 31.23, 121.47, 'Asia/Shanghai', '上海'),
  c('Hong Kong', 'HK', 22.32, 114.17, 'Asia/Hong_Kong', '香港'),
  c('Bangkok', 'TH', 13.76, 100.5, 'Asia/Bangkok', 'กรุงเทพฯ'),
  c('Phuket', 'TH', 7.88, 98.39, 'Asia/Bangkok', 'ภูเก็ต'),
  c('Hanói', 'VN', 21.03, 105.85, 'Asia/Ho_Chi_Minh', 'Hà Nội'),
  c('Singapura', 'SG', 1.35, 103.82, 'Asia/Singapore', 'Singapore'),
  c('Bali', 'ID', -8.65, 115.22, 'Asia/Makassar'),
  c('Dubai', 'AE', 25.2, 55.27, 'Asia/Dubai', 'دبي'),
  c('Nova Délhi', 'IN', 28.61, 77.21, 'Asia/Kolkata', 'नई दिल्ली'),
  c('Jerusalém', 'IL', 31.77, 35.21, 'Asia/Jerusalem', 'ירושלים'),
  // África e Oceania
  c('Cairo', 'EG', 30.04, 31.24, 'Africa/Cairo', 'القاهرة'),
  c('Marrakech', 'MA', 31.63, -8.01, 'Africa/Casablanca', 'مراكش'),
  c('Cidade do Cabo', 'ZA', -33.92, 18.42, 'Africa/Johannesburg', 'Cape Town'),
  c('Sydney', 'AU', -33.87, 151.21, 'Australia/Sydney'),
  c('Melbourne', 'AU', -37.81, 144.96, 'Australia/Melbourne'),
  c('Auckland', 'NZ', -36.85, 174.76, 'Pacific/Auckland'),
  c('Queenstown', 'NZ', -45.03, 168.66, 'Pacific/Auckland'),
]

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Busca por começo de palavra, sem acento. */
export function searchCities(q: string, limit = 8): City[] {
  const f = fold(q)
  if (f.length < 2) return []
  // Nome exato primeiro, depois os mais curtos ("Porto" antes de "Porto Seguro").
  const starts = CITIES.filter(
    (x) => fold(x.name).startsWith(f) || fold(x.localName ?? '').startsWith(f),
  ).sort((a, b) => Number(fold(b.name) === f) - Number(fold(a.name) === f) || a.name.length - b.name.length)
  const inside = CITIES.filter((x) => !starts.includes(x) && fold(x.name).includes(f))
  return [...starts, ...inside].slice(0, limit)
}

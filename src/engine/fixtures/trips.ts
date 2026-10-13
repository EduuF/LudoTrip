import { buildTrip } from './build'
import type { BuiltTrip } from './build'

// Viagens de exemplo (spec §19). Datas e pessoas são fictícias.

const SAO_PAULO = { name: 'São Paulo', lat: -23.55, lon: -46.63, tz: 'America/Sao_Paulo' }

export const japao = (): BuiltTrip =>
  buildTrip({
    name: 'Japão: várias cidades de trem',
    start: '2030-04-01',
    lock: 'fixed',
    defaultMode: 'train',
    home: SAO_PAULO,
    scope: { name: 'Japão', localName: '日本', kind: 'country', country: 'JP' },
    destinations: {
      tokyo: { name: 'Tóquio', localName: '東京', country: 'JP', lat: 35.68, lon: 139.77, tz: 'Asia/Tokyo' },
      ginzan: {
        name: 'Ginzan Onsen',
        localName: '銀山温泉',
        country: 'JP',
        lat: 38.57,
        lon: 140.53,
        tz: 'Asia/Tokyo',
      },
      kawa: {
        name: 'Kawaguchiko',
        localName: '河口湖',
        country: 'JP',
        lat: 35.5,
        lon: 138.77,
        tz: 'Asia/Tokyo',
      },
      kama: { name: 'Kamakura', localName: '鎌倉', country: 'JP', lat: 35.32, lon: 139.55, tz: 'Asia/Tokyo' },
      osaka: { name: 'Osaka', localName: '大阪', country: 'JP', lat: 34.69, lon: 135.5, tz: 'Asia/Tokyo' },
      kyoto: { name: 'Kyoto', localName: '京都', country: 'JP', lat: 35.01, lon: 135.77, tz: 'Asia/Tokyo' },
      nara: { name: 'Nara', localName: '奈良', country: 'JP', lat: 34.68, lon: 135.84, tz: 'Asia/Tokyo' },
      hakone: { name: 'Hakone', localName: '箱根', country: 'JP', lat: 35.23, lon: 139.11, tz: 'Asia/Tokyo' },
    },
    stops: [
      ['tokyo', 2, [[], ['Sensō-ji', 'Rio Sumida']]],
      ['ginzan', 1, [['Vila de Ginzan']]],
      ['tokyo', 2],
      ['kawa', 1, [['Pagode Chureito', 'Lago Kawaguchi']]],
      ['tokyo', 1],
      ['kama', 1, [['Grande Buda', 'Hasedera']]],
      [
        'osaka',
        4,
        [[], ['Castelo de Osaka', 'Dotonbori'], ['Parque de Nara', 'Tōdai-ji'], ['Shinsekai', 'Kuromon']],
      ],
      [
        'kyoto',
        7,
        [
          ['Gion'],
          ['Kiyomizu-dera'],
          ['Fushimi Inari'],
          ['Arashiyama'],
          ['Kinkaku-ji'],
          ['Mercado Nishiki'],
          ['Caminho do Filósofo'],
        ],
      ],
      ['tokyo', 4, [[], ['Akihabara'], ['Shibuya'], []]],
    ],
    places: {
      tokyo: [
        ['Sensō-ji', 'must', 35.7148, 139.7967, 'sight'],
        ['Rio Sumida', 'maybe', 35.7105, 139.804, 'nature'],
        ['Akihabara', 'want', 35.6984, 139.7731, 'shop'],
        ['Shibuya', 'want', 35.6595, 139.7005, 'sight'],
        ['teamLab Planets', 'must', 35.6489, 139.7898, 'sight'],
      ],
      ginzan: [['Vila de Ginzan', 'must', 38.5703, 140.53, 'sight']],
      kawa: [
        ['Pagode Chureito', 'must', 35.5012, 138.8013, 'sight'],
        ['Lago Kawaguchi', 'want', 35.5145, 138.767, 'nature'],
      ],
      kama: [
        ['Grande Buda', 'must', 35.3168, 139.5357, 'sight'],
        ['Hasedera', 'want', 35.3125, 139.5332, 'sight'],
      ],
      osaka: [
        ['Castelo de Osaka', 'want', 34.6873, 135.5259, 'sight'],
        ['Dotonbori', 'must', 34.6687, 135.5013, 'food'],
        ['Shinsekai', 'maybe', 34.6525, 135.5063, 'sight'],
        ['Kuromon', 'maybe', 34.6654, 135.5066, 'food'],
      ],
      nara: [
        ['Parque de Nara', 'must', 34.6851, 135.843, 'nature'],
        ['Tōdai-ji', 'must', 34.689, 135.8398, 'sight'],
      ],
      kyoto: [
        ['Gion', 'want', 35.0037, 135.775, 'sight'],
        ['Kiyomizu-dera', 'must', 34.9949, 135.785, 'sight'],
        ['Fushimi Inari', 'must', 34.9671, 135.7727, 'sight'],
        ['Arashiyama', 'must', 35.017, 135.6713, 'nature'],
        ['Kinkaku-ji', 'must', 35.0394, 135.7292, 'sight'],
        ['Mercado Nishiki', 'maybe', 35.005, 135.7649, 'food'],
        ['Caminho do Filósofo', 'want', 35.0235, 135.7944, 'nature'],
        ['Sanjūsangen-dō', 'must', 34.9878, 135.7716, 'sight'],
      ],
      hakone: [['Onsen com vista', 'maybe', 35.2323, 139.1069, 'nature']],
    },
    legModes: [
      ['home', 'tokyo', 'flight'],
      ['tokyo', 'home', 'flight'],
    ],
    bookings: [
      {
        kind: 'lodging',
        title: 'Hotel em Kyoto',
        dest: 'kyoto',
        checkin: '2030-04-13',
        checkout: '2030-04-20',
      },
      {
        kind: 'transport',
        title: 'Trem-bala Kyoto → Tóquio',
        from: 'kyoto',
        to: 'tokyo',
        date: '2030-04-20',
        mode: 'train',
      },
      {
        kind: 'transport',
        title: 'Voo Tóquio → São Paulo',
        from: 'tokyo',
        to: 'home',
        date: '2030-04-24',
        mode: 'flight',
      },
    ],
  })

export const rio = (): BuiltTrip =>
  buildTrip({
    name: 'Rio: uma cidade',
    start: '2030-07-10',
    lock: 'free',
    defaultMode: 'flight',
    home: { name: 'Belo Horizonte', lat: -19.92, lon: -43.94, tz: 'America/Sao_Paulo' },
    scope: { name: 'Rio de Janeiro', kind: 'city', country: 'BR', lat: -22.91, lon: -43.17 },
    destinations: {
      rio: { name: 'Rio de Janeiro', country: 'BR', lat: -22.91, lon: -43.17 },
      petropolis: { name: 'Petrópolis', country: 'BR', lat: -22.51, lon: -43.18 },
    },
    stops: [['rio', 5, [[], ['Cristo Redentor'], ['Museu Imperial'], ['Pão de Açúcar'], []]]],
    places: {
      rio: [
        ['Cristo Redentor', 'must', -22.9519, -43.2105, 'sight'],
        ['Pão de Açúcar', 'must', -22.9492, -43.1545, 'sight'],
        ['Escadaria Selarón', 'want', -22.9173, -43.1792, 'sight'],
      ],
      petropolis: [['Museu Imperial', 'want', -22.5058, -43.1757, 'sight']],
    },
    bookings: [
      {
        kind: 'lodging',
        title: 'Hotel em Copacabana',
        dest: 'rio',
        checkin: '2030-07-10',
        checkout: '2030-07-15',
      },
    ],
  })

export const portugal = (): BuiltTrip =>
  buildTrip({
    name: 'Portugal de carro alugado',
    start: '2030-09-10',
    lock: 'free',
    defaultMode: 'car',
    home: SAO_PAULO,
    scope: { name: 'Portugal', kind: 'country', country: 'PT' },
    destinations: {
      lisboa: { name: 'Lisboa', country: 'PT', lat: 38.72, lon: -9.14 },
      nazare: { name: 'Nazaré', country: 'PT', lat: 39.6, lon: -9.07 },
      coimbra: { name: 'Coimbra', country: 'PT', lat: 40.21, lon: -8.43 },
      porto: { name: 'Porto', country: 'PT', lat: 41.15, lon: -8.61 },
      douro: { name: 'Vale do Douro', country: 'PT', lat: 41.16, lon: -7.79, kind: 'region' },
      lagos: { name: 'Lagos', country: 'PT', lat: 37.1, lon: -8.67 },
      sintra: { name: 'Sintra', country: 'PT', lat: 38.8, lon: -9.39 },
    },
    stops: [
      ['lisboa', 3, [[], ['Belém', 'Alfama'], ['Palácio da Pena']]],
      ['nazare', 1, [['Ondas do Sítio']]],
      ['coimbra', 1],
      ['porto', 3, [[], ['Ribeira', 'Livraria Lello'], ['Caves do vinho']]],
      ['douro', 2, [['Quinta com degustação']]],
      ['lagos', 3, [[], ['Ponta da Piedade']]],
      ['lisboa', 1],
    ],
    places: {
      lisboa: [
        ['Belém', 'must', 38.6916, -9.216, 'sight'],
        ['Alfama', 'want', 38.7115, -9.13, 'sight'],
        ['LX Factory', 'maybe', 38.7034, -9.1784, 'shop'],
      ],
      sintra: [['Palácio da Pena', 'must', 38.7876, -9.3904, 'sight']],
      nazare: [['Ondas do Sítio', 'must', 39.604, -9.085, 'nature']],
      coimbra: [['Biblioteca Joanina', 'must', 40.2075, -8.4259, 'sight']],
      porto: [
        ['Ribeira', 'must', 41.1407, -8.613, 'sight'],
        ['Livraria Lello', 'maybe', 41.1468, -8.6149, 'shop'],
        ['Caves do vinho', 'want', 41.134, -8.613, 'food'],
      ],
      douro: [['Quinta com degustação', 'must', 41.19, -7.54, 'food']],
      lagos: [['Ponta da Piedade', 'must', 37.079, -8.669, 'nature']],
    },
    legModes: [
      ['home', 'lisboa', 'flight'],
      ['lisboa', 'home', 'flight'],
    ],
    bookings: [
      {
        kind: 'lodging',
        title: 'Hotel no Porto',
        dest: 'porto',
        checkin: '2030-09-15',
        checkout: '2030-09-18',
      },
    ],
    resources: [
      { kind: 'rental-car', title: 'Carro alugado', start: '2030-09-13', end: '2030-09-23', covers: ['car'] },
    ],
  })

export const europa = (): BuiltTrip =>
  buildTrip({
    name: 'Lisboa, Paris e Roma de avião',
    start: '2030-06-01',
    lock: 'fixed',
    defaultMode: 'flight',
    home: SAO_PAULO,
    scope: { name: 'Europa', kind: 'region' },
    destinations: {
      lisboa: { name: 'Lisboa', country: 'PT', lat: 38.72, lon: -9.14 },
      paris: { name: 'Paris', country: 'FR', lat: 48.86, lon: 2.35 },
      roma: { name: 'Roma', country: 'IT', lat: 41.9, lon: 12.5 },
      versalhes: { name: 'Versalhes', country: 'FR', lat: 48.8, lon: 2.13 },
    },
    stops: [
      ['lisboa', 3, [[], ['Alfama'], ['Belém']]],
      ['paris', 4, [[], ['Torre Eiffel'], ['Louvre'], ['Palácio de Versalhes']]],
      ['roma', 4, [[], ['Coliseu'], ['Vaticano'], []]],
    ],
    places: {
      lisboa: [
        ['Alfama', 'want', 38.7115, -9.13, 'sight'],
        ['Belém', 'must', 38.6916, -9.216, 'sight'],
      ],
      paris: [
        ['Torre Eiffel', 'must', 48.8584, 2.2945, 'sight'],
        ['Louvre', 'must', 48.8606, 2.3376, 'sight'],
        ["Musée d'Orsay", 'must', 48.86, 2.3266, 'sight'],
        ['Montmartre', 'maybe', 48.8867, 2.3431, 'sight'],
      ],
      versalhes: [['Palácio de Versalhes', 'must', 48.8049, 2.1204, 'sight']],
      roma: [
        ['Coliseu', 'must', 41.8902, 12.4922, 'sight'],
        ['Vaticano', 'must', 41.9029, 12.4534, 'sight'],
        ['Trastevere', 'want', 41.8893, 12.47, 'food'],
      ],
    },
    bookings: [
      {
        kind: 'transport',
        title: 'Voo Lisboa → Paris',
        from: 'lisboa',
        to: 'paris',
        date: '2030-06-04',
        mode: 'flight',
      },
      {
        kind: 'lodging',
        title: 'Hotel em Paris',
        dest: 'paris',
        checkin: '2030-06-04',
        checkout: '2030-06-08',
      },
      {
        kind: 'transport',
        title: 'Voo Roma → São Paulo',
        from: 'roma',
        to: 'home',
        date: '2030-06-12',
        mode: 'flight',
      },
    ],
  })

export const cruzeiro = (): BuiltTrip =>
  buildTrip({
    name: 'Cruzeiro pelo Mediterrâneo',
    start: '2030-05-03',
    lock: 'fixed',
    defaultMode: 'boat',
    home: SAO_PAULO,
    scope: { name: 'Mediterrâneo', kind: 'region' },
    destinations: {
      barcelona: { name: 'Barcelona', country: 'ES', lat: 41.39, lon: 2.17 },
      navio: { name: 'Navio', country: 'ES', lat: 41.35, lon: 2.16, kind: 'vessel' },
      marselha: { name: 'Marselha', country: 'FR', lat: 43.3, lon: 5.37 },
      genova: { name: 'Gênova', country: 'IT', lat: 44.41, lon: 8.93 },
      roma: { name: 'Roma', country: 'IT', lat: 41.9, lon: 12.5 },
      napoles: { name: 'Nápoles', country: 'IT', lat: 40.85, lon: 14.27 },
      palma: { name: 'Palma de Maiorca', country: 'ES', lat: 39.57, lon: 2.65 },
    },
    stops: [
      ['barcelona', 2, [[], ['Sagrada Família']]],
      [
        'navio',
        7,
        [
          [],
          ['Velho Porto'],
          ['Centro histórico de Gênova'],
          ['Coliseu'],
          ['Pompeia'],
          [],
          ['Catedral de Palma'],
        ],
        'onboard',
      ],
      ['barcelona', 1],
    ],
    places: {
      barcelona: [
        ['Sagrada Família', 'must', 41.4036, 2.1744, 'sight'],
        ['Park Güell', 'want', 41.4145, 2.1527, 'nature'],
      ],
      marselha: [['Velho Porto', 'want', 43.2951, 5.374, 'sight']],
      genova: [['Centro histórico de Gênova', 'maybe', 44.4075, 8.934, 'sight']],
      roma: [['Coliseu', 'must', 41.8902, 12.4922, 'sight']],
      napoles: [['Pompeia', 'must', 40.751, 14.487, 'sight']],
      palma: [['Catedral de Palma', 'want', 39.5676, 2.6482, 'sight']],
    },
    legModes: [
      ['home', 'barcelona', 'flight'],
      ['barcelona', 'home', 'flight'],
    ],
  })

export const caminho = (): BuiltTrip =>
  buildTrip({
    name: 'Caminho de Santiago a pé',
    start: '2030-09-01',
    lock: 'fixed',
    defaultMode: 'walk',
    home: SAO_PAULO,
    scope: { name: 'Galícia', localName: 'Galicia', kind: 'region', country: 'ES' },
    destinations: {
      sarria: { name: 'Sarria', country: 'ES', lat: 42.78, lon: -7.41 },
      portomarin: { name: 'Portomarín', country: 'ES', lat: 42.81, lon: -7.62 },
      palas: { name: 'Palas de Rei', country: 'ES', lat: 42.87, lon: -7.87 },
      arzua: { name: 'Arzúa', country: 'ES', lat: 42.93, lon: -8.16 },
      pedrouzo: { name: 'O Pedrouzo', country: 'ES', lat: 42.9, lon: -8.36 },
      santiago: { name: 'Santiago de Compostela', country: 'ES', lat: 42.88, lon: -8.54 },
    },
    stops: [
      ['sarria', 1],
      ['portomarin', 1],
      ['palas', 1],
      ['arzua', 1],
      ['pedrouzo', 1],
      ['santiago', 2, [['Missa do Peregrino'], ['Catedral']]],
    ],
    places: {
      santiago: [
        ['Missa do Peregrino', 'must', 42.8806, -8.5446, 'sight'],
        ['Catedral', 'must', 42.8806, -8.5446, 'sight'],
      ],
    },
    legModes: [
      ['home', 'sarria', 'flight'],
      ['santiago', 'home', 'flight'],
    ],
  })

export const ALL_TRIPS = { japao, rio, portugal, europa, cruzeiro, caminho }

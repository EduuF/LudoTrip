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
        ['Sensō-ji', 'must'],
        ['Rio Sumida', 'maybe'],
        ['Akihabara', 'want'],
        ['Shibuya', 'want'],
        ['teamLab Planets', 'must'],
      ],
      ginzan: [['Vila de Ginzan', 'must']],
      kawa: [
        ['Pagode Chureito', 'must'],
        ['Lago Kawaguchi', 'want'],
      ],
      kama: [
        ['Grande Buda', 'must'],
        ['Hasedera', 'want'],
      ],
      osaka: [
        ['Castelo de Osaka', 'want'],
        ['Dotonbori', 'must'],
        ['Shinsekai', 'maybe'],
        ['Kuromon', 'maybe'],
      ],
      nara: [
        ['Parque de Nara', 'must'],
        ['Tōdai-ji', 'must'],
      ],
      kyoto: [
        ['Gion', 'want'],
        ['Kiyomizu-dera', 'must'],
        ['Fushimi Inari', 'must'],
        ['Arashiyama', 'must'],
        ['Kinkaku-ji', 'must'],
        ['Mercado Nishiki', 'maybe'],
        ['Caminho do Filósofo', 'want'],
        ['Sanjūsangen-dō', 'must'],
      ],
      hakone: [['Onsen com vista', 'maybe']],
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
    destinations: {
      rio: { name: 'Rio de Janeiro', country: 'BR', lat: -22.91, lon: -43.17 },
      petropolis: { name: 'Petrópolis', country: 'BR', lat: -22.51, lon: -43.18 },
    },
    stops: [['rio', 5, [[], ['Cristo Redentor'], ['Museu Imperial'], ['Pão de Açúcar'], []]]],
    places: {
      rio: [
        ['Cristo Redentor', 'must'],
        ['Pão de Açúcar', 'must'],
        ['Escadaria Selarón', 'want'],
      ],
      petropolis: [['Museu Imperial', 'want']],
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
        ['Belém', 'must'],
        ['Alfama', 'want'],
        ['LX Factory', 'maybe'],
      ],
      sintra: [['Palácio da Pena', 'must']],
      nazare: [['Ondas do Sítio', 'must']],
      coimbra: [['Biblioteca Joanina', 'must']],
      porto: [
        ['Ribeira', 'must'],
        ['Livraria Lello', 'maybe'],
        ['Caves do vinho', 'want'],
      ],
      douro: [['Quinta com degustação', 'must']],
      lagos: [['Ponta da Piedade', 'must']],
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
        ['Alfama', 'want'],
        ['Belém', 'must'],
      ],
      paris: [
        ['Torre Eiffel', 'must'],
        ['Louvre', 'must'],
        ["Musée d'Orsay", 'must'],
        ['Montmartre', 'maybe'],
      ],
      versalhes: [['Palácio de Versalhes', 'must']],
      roma: [
        ['Coliseu', 'must'],
        ['Vaticano', 'must'],
        ['Trastevere', 'want'],
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
        ['Sagrada Família', 'must'],
        ['Park Güell', 'want'],
      ],
      marselha: [['Velho Porto', 'want']],
      genova: [['Centro histórico de Gênova', 'maybe']],
      roma: [['Coliseu', 'must']],
      napoles: [['Pompeia', 'must']],
      palma: [['Catedral de Palma', 'want']],
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
        ['Missa do Peregrino', 'must'],
        ['Catedral', 'must'],
      ],
    },
    legModes: [
      ['home', 'sarria', 'flight'],
      ['santiago', 'home', 'flight'],
    ],
  })

export const ALL_TRIPS = { japao, rio, portugal, europa, cruzeiro, caminho }

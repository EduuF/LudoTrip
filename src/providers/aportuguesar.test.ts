import { describe, expect, it } from 'vitest'
import { aportuguesar, cidadePt } from './aportuguesar'

describe('aportuguesar nomes do Photon', () => {
  it('marcos famosos usam o nome consagrado', () => {
    expect(aportuguesar('Christ the Redeemer')).toBe('Cristo Redentor')
    expect(aportuguesar('Eiffel Tower')).toBe('Torre Eiffel')
    expect(aportuguesar('Mount Fuji')).toBe('Monte Fuji')
    expect(aportuguesar('Tokyo Imperial Palace')).toBe('Palácio Imperial de Tóquio')
    expect(aportuguesar('Christ the Redeemer of the Andes')).toBe('Cristo Redentor de Andes')
    expect(aportuguesar('Christ the Redeemer Hill')).toBe('Morro Cristo Redentor')
    expect(aportuguesar('Christ the Redeemer Church')).toBe('Igreja Cristo Redentor')
  })

  it('termo genérico vai para a frente', () => {
    expect(aportuguesar('Uminomori Park')).toBe('Parque Uminomori')
    expect(aportuguesar('Fushimi Inari Shrine')).toBe('Santuário Fushimi Inari')
    expect(aportuguesar('Ueno Zoo')).toBe('Zoológico Ueno')
    expect(aportuguesar('Shinjuku Gyoen National Park')).toBe('Parque Nacional Shinjuku Gyoen')
    expect(aportuguesar('Lake Kawaguchi')).toBe('Lago Kawaguchi')
    expect(aportuguesar('Mount Takao')).toBe('Monte Takao')
    expect(aportuguesar('Fushimi Inari-taisha')).toBe('Santuário Fushimi Inari')
    expect(aportuguesar('Meiji Jingu')).toBe('Santuário Meiji')
    expect(aportuguesar('Kiyomizu-dera')).toBe('Templo Kiyomizu')
  })

  it('cidade conhecida no resto vira "de Cidade"', () => {
    expect(aportuguesar('Tokyo Tower')).toBe('Torre de Tóquio')
    expect(aportuguesar('Tokyo International Airport')).toBe('Aeroporto Internacional de Tóquio')
  })

  it('cidades e o que não tem regra', () => {
    expect(aportuguesar('Tokyo')).toBe('Tóquio')
    expect(cidadePt('London')).toBe('Londres')
    expect(cidadePt('Kyoto')).toBe('Kyoto')
    expect(aportuguesar('La Ceaun')).toBe('La Ceaun')
  })
})

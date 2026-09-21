import { describe, expect, it } from 'vitest'

import { normalizeUmlMultiplicity, validateUmlRelationship } from './uml-relationship-validation'

describe('UML relationship validation', () => {
  it('reports endpoint, self-link, multiplicity, and composition errors', () => {
    const errors = validateUmlRelationship({ type: 'composition', sourceId: 'a', targetId: 'a', sourceKind: 'class', targetKind: 'enum', sourceMultiplicity: '0..*', targetMultiplicity: '2..1' })

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('consigo mismo'),
      expect.stringContaining('multiplicidad'),
      expect.stringContaining('clases o clases abstractas'),
      expect.stringContaining('composición'),
    ]))
  })

  it('accepts legacy enum usage after endpoint normalization', () => {
    expect(validateUmlRelationship({ type: 'enumUsage', sourceId: 'user', targetId: 'status', sourceKind: 'class', targetKind: 'enum' })).toEqual([])
  })

  it('rejects enum usage between two classes', () => {
    expect(validateUmlRelationship({ type: 'enumUsage', sourceId: 'user', targetId: 'other', sourceKind: 'class', targetKind: 'class' }).some((error) => error.includes('enum'))).toBe(true)
  })

  it('accepts supported multiplicities and normalizes the reversed zero/one alias without changing input', () => {
    expect(validateUmlRelationship({ type: 'association', sourceId: 'a', targetId: 'b', sourceKind: 'class', targetKind: 'class', sourceMultiplicity: '1..0', targetMultiplicity: '0..*' })).toEqual([])
    expect(normalizeUmlMultiplicity('1')).toEqual({ lower: 1, upper: 1 })
    expect(normalizeUmlMultiplicity('2..3')).toEqual({ lower: 2, upper: 3 })
    expect(normalizeUmlMultiplicity('1..*')).toEqual({ lower: 1, upper: null })
    expect(normalizeUmlMultiplicity('*')).toEqual({ lower: 0, upper: null })
    expect(normalizeUmlMultiplicity('1..0')).toEqual({ lower: 0, upper: 1 })
    expect(normalizeUmlMultiplicity('0..*')).toEqual({ lower: 0, upper: null })
  })

  it('rejects malformed syntax and genuinely reversed ranges', () => {
    const errors = validateUmlRelationship({ type: 'association', sourceId: 'a', targetId: 'b', sourceKind: 'class', targetKind: 'class', sourceMultiplicity: 'many', targetMultiplicity: '2..1' })

    expect(errors).toEqual(expect.arrayContaining([
      expect.stringContaining('debe usar'),
      expect.stringContaining('límite superior'),
    ]))
  })
})

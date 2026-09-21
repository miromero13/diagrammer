import { describe, expect, it } from 'vitest'

import { validateUmlRelationship } from './uml-relationship-validation'

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
})

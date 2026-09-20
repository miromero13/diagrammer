import { describe, expect, it } from 'vitest'

import { formatUmlAttribute, formatUmlMethod, parseUmlAttribute, parseUmlMethod, validateUmlAttributes, validateUmlMethods } from './uml-member-format'

describe('UML member format', () => {
  it('allows optional attribute types and typed methods', () => {
    expect(validateUmlAttributes('+active\n-name: String\n#roles: List<Role> [0..*]')).toEqual([])
    expect(validateUmlMethods('+calculateTotal(items: List<Item>): Decimal\n-cancel(): void')).toEqual([])
  })

  it('rejects malformed members without rejecting XMI-compatible optional types', () => {
    expect(validateUmlAttributes('name String')).not.toEqual([])
    expect(validateUmlMethods('calculateTotal(items String): Decimal')).not.toEqual([])
    expect(validateUmlAttributes('+name')).toEqual([])
    expect(validateUmlMethods('+reset()')).toEqual([])
  })

  it('turns structured fields into the XMI-compatible UML notation', () => {
    expect(formatUmlAttribute(parseUmlAttribute('-name: String [1]'))).toBe('name: String [1]')
    expect(formatUmlMethod(parseUmlMethod('+setStatus(value: Status): Status'))).toBe('setStatus(value: Status): Status')
  })

  it('keeps newly added placeholder members parseable', () => {
    expect(validateUmlAttributes('atributo')).toEqual([])
    expect(validateUmlMethods('metodo(): void')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'

import { formatUmlAttribute, formatUmlAttributeLabel, formatUmlMethod, formatUmlMethodLabel, parseUmlAttribute, parseUmlMethod, validateUmlAttributes, validateUmlMethods } from './uml-member-format'

describe('UML member format', () => {
  it('allows optional attribute types and typed methods', () => {
    expect(validateUmlAttributes('+active\n-name: String\n#roles: List<Role> [0..*]')).toEqual([])
    expect(validateUmlMethods('+calculateTotal(items: List<Item>): Decimal\n-cancel(): void')).toEqual([])
  })

  it('accepts parser-supported derived, default, and modifier syntax', () => {
    expect(validateUmlAttributes('-/total: Decimal [1] = 0 {static}')).toEqual([])
    expect(validateUmlAttributes('+state: String = "ready" {abstract}')).toEqual([])
    expect(validateUmlAttributes('count: Integer {STATIC}')).toEqual([])
    expect(validateUmlMethods('#/calculate(): Decimal {abstract, static}')).toEqual([])
    expect(validateUmlAttributes('name: String {instance}')).not.toEqual([])
  })

  it('rejects malformed members without rejecting XMI-compatible optional types', () => {
    expect(validateUmlAttributes('name String')).not.toEqual([])
    expect(validateUmlMethods('calculateTotal(items String): Decimal')).not.toEqual([])
    expect(validateUmlAttributes('+name')).toEqual([])
    expect(validateUmlMethods('+reset()')).toEqual([])
  })

  it('turns structured fields into the XMI-compatible UML notation', () => {
    expect(formatUmlAttribute(parseUmlAttribute('-name: String [1]'))).toBe('-name: String [1]')
    expect(formatUmlMethod(parseUmlMethod('+setStatus(value: Status): Status'))).toBe('+setStatus(value: Status): Status')
  })

  it('parses and renders member semantics without changing the stored base string', () => {
    const attribute = parseUmlAttribute('-/total: Decimal [1] = 0 {static}')
    const method = parseUmlMethod('#calculate(): Decimal {abstract, static}')

    expect(attribute).toMatchObject({ visibility: '-', name: 'total', isDerived: true, isStatic: true, defaultValue: '0' })
    expect(method).toMatchObject({ visibility: '#', name: 'calculate', isAbstract: true, isStatic: true })
    expect(formatUmlAttribute(attribute)).toBe('-total: Decimal [1]')
    expect(formatUmlMethod(method)).toBe('#calculate(): Decimal')
    expect(formatUmlAttributeLabel(attribute)).toBe('-/total: Decimal [1] = 0 {static}')
    expect(formatUmlMethodLabel(method)).toBe('#calculate(): Decimal {static, abstract}')
  })

  it('keeps newly added placeholder members parseable', () => {
    expect(validateUmlAttributes('atributo')).toEqual([])
    expect(validateUmlMethods('metodo(): void')).toEqual([])
  })
})

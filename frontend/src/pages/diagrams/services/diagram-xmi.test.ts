import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildEnterpriseArchitectXmi } from '../components/diagram-export-dropdown'
import { materializeManyToMany } from '../many-to-many'
import { parseDiagramXmi } from './diagram-xmi'

describe('parseDiagramXmi', () => {
  it('imports namespaced classifiers, positions, and standard relationships', () => {
    const content = parseDiagramXmi(`<xmi:XMI xmlns:xmi="urn:xmi" xmlns:uml="urn:uml" xmlns:umldi="urn:umldi" xmlns:dc="urn:dc"><uml:Model xmi:type="uml:Model" xmi:id="model"><packagedElement xmi:type="uml:Class" xmi:id="a" name="A"><ownedAttribute xmi:type="uml:Property" xmi:id="a-name" name="name" visibility="private" type="b"><lowerValue xmi:type="uml:LiteralInteger" value="1"></lowerValue><upperValue xmi:type="uml:LiteralUnlimitedNatural" value="1"></upperValue></ownedAttribute><generalization xmi:type="uml:Generalization" xmi:id="general" general="b"></generalization></packagedElement><packagedElement xmi:type="uml:Interface" xmi:id="i" name="I"></packagedElement><packagedElement xmi:type="uml:Class" xmi:id="b" name="B"><interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="realization" client="b" supplier="i"></interfaceRealization></packagedElement><packagedElement xmi:type="uml:Association" xmi:id="association"><memberEnd xmi:idref="source-end"></memberEnd><memberEnd xmi:idref="target-end"></memberEnd><ownedEnd xmi:type="uml:Property" xmi:id="source-end" type="a" aggregation="composite"><lowerValue value="1"></lowerValue><upperValue value="1"></upperValue></ownedEnd><ownedEnd xmi:type="uml:Property" xmi:id="target-end" type="b"><lowerValue value="0"></lowerValue><upperValue value="*"></upperValue></ownedEnd></packagedElement></uml:Model><umldi:Diagram xmi:type="umldi:UMLClassDiagram" xmi:id="diagram"><ownedElement xmi:type="umldi:UMLClassifierShape" modelElement="a"><bounds xmi:type="dc:Bounds" x="-10" y="20" width="300" height="160"></bounds></ownedElement></umldi:Diagram></xmi:XMI>`)

    expect(content.elements?.length).toBe(3)
    expect(content.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'inheritance', sourceId: 'a', targetId: 'b' }),
      expect.objectContaining({ type: 'implementation', sourceId: 'b', targetId: 'i' }),
      expect.objectContaining({ type: 'composition', sourceId: 'a', targetId: 'b', sourceMultiplicity: '1', targetMultiplicity: '0..*' }),
    ]))
    expect(content.elements?.find((element) => element.id === 'a')?.attributes).toEqual(['-name: B [1]'])
    expect(content.elements?.find((element) => element.id === 'a')?.position).toEqual({ x: 80, y: 80 })
  })

  it('round-trips every supported exported relationship', () => {
    const nodes = ['A', 'B', 'I'].map((name) => ({ id: name, position: { x: 0, y: 0 }, data: { name, kind: name === 'I' ? ('interface' as const) : ('class' as const), attributes: [], methods: [] } }))
    const edges = ([
      ['inheritance', 'A', 'B'], ['implementation', 'B', 'I'], ['dependency', 'A', 'I'],
      ['association', 'A', 'B'], ['composition', 'A', 'B'], ['aggregation', 'B', 'A'],
    ] as const).map(([relationType, source, target], index) => ({ id: `edge-${index}`, source, target, data: { relationType, sourceMultiplicity: '0..*', targetMultiplicity: '1' } }))
    const exported = buildEnterpriseArchitectXmi('round-trip', nodes, edges)
    const content = parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>'))

    expect(content.connections?.map((connection) => connection.type)).toEqual(expect.arrayContaining(['inheritance', 'implementation', 'dependency', 'association', 'composition', 'aggregation']))
    expect(content.connections).toHaveLength(6)
  })

  it('exports many-to-many association classes as one UML AssociationClass classifier', () => {
    const nodes = [
      { id: 'user', position: { x: 0, y: 0 }, data: { name: 'User', kind: 'class' as const, attributes: [], methods: [] } },
      { id: 'role', position: { x: 320, y: 0 }, data: { name: 'Role', kind: 'class' as const, attributes: [], methods: [] } },
      { id: 'user-role-association-class', position: { x: 160, y: 200 }, data: { name: 'Membership', kind: 'class' as const, attributes: ['+assignedAt: Date'], methods: ['+activate(): void'] } },
    ]
    const exported = buildEnterpriseArchitectXmi('many-to-many', nodes, [{
      id: 'user-role', source: 'user', target: 'role',
      data: { relationType: 'association' as const, sourceMultiplicity: '0..*', targetMultiplicity: '0..*', associationClassId: 'user-role-association-class' },
    }])

    expect(exported).toContain('xmi:type="uml:AssociationClass"')
    expect(exported).toContain('name="Membership"')
    expect(exported).toContain('name="assignedAt"')
    expect(exported).toContain('name="activate"')
    expect(exported).not.toContain('xmi:type="uml:Association"')
    expect(exported.match(/modelElement="user-role-association-class"/g)).toHaveLength(1)
    expect(exported).toContain('value="0"')
    expect(exported).toContain('value="*"')
  })

  it('round-trips the association class and both endpoint multiplicities', () => {
    const nodes = [
      { id: 'user', position: { x: 0, y: 0 }, data: { name: 'User', kind: 'class' as const, attributes: [], methods: [] } },
      { id: 'role', position: { x: 320, y: 0 }, data: { name: 'Role', kind: 'class' as const, attributes: [], methods: [] } },
      { id: 'user-role-association-class', position: { x: 160, y: 200 }, data: { name: 'Membership', kind: 'class' as const, attributes: ['+assignedAt: Date'], methods: [] } },
    ]
    const exported = buildEnterpriseArchitectXmi('many-to-many', nodes, [{
      id: 'user-role', source: 'user', target: 'role',
      data: { relationType: 'association' as const, sourceMultiplicity: '1..*', targetMultiplicity: '0..*', associationClassId: 'user-role-association-class' },
    }])
    const parsed = materializeManyToMany(parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>')))

    expect(parsed.elements).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'user-role-association-class', name: 'Membership', attributes: ['+assignedAt: Date'] })]))
    expect(parsed.connections).toEqual([expect.objectContaining({ id: 'user-role', associationClassId: 'user-role-association-class', sourceMultiplicity: '1..*', targetMultiplicity: '0..*' })])
  })

  it('imports and exports enum literals and enum references', () => {
    const nodes = [
      { id: 'status', position: { x: 0, y: 0 }, data: { name: 'Status', kind: 'enum' as const, attributes: [], methods: [], literals: ['ACTIVE', 'DISABLED'] } },
      { id: 'user', position: { x: 300, y: 0 }, data: { name: 'User', kind: 'class' as const, attributes: ['-status: Status'], methods: ['+setStatus(value: Status): Status'], literals: [] } },
    ]
    const exported = buildEnterpriseArchitectXmi('enums', nodes, [])
    expect(exported).toContain('uml:Enumeration')
    expect(exported).toContain('uml:EnumerationLiteral')
    expect(exported).toContain('name="ACTIVE"')
    const content = parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>'))

    expect(content.elements).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'status', type: 'uml.Enumeration', literals: ['ACTIVE', 'DISABLED'] }),
      expect.objectContaining({ id: 'user', attributes: ['-status: Status'], methods: ['+setStatus(value: Status): Status'] }),
    ]))
  })

  it('round-trips dedicated enum usage as a marked UML dependency', () => {
    const nodes = [
      { id: 'status', position: { x: 0, y: 0 }, data: { name: 'Status', kind: 'enum' as const, attributes: [], methods: [], literals: ['ACTIVE'] } },
      { id: 'user', position: { x: 300, y: 0 }, data: { name: 'User', kind: 'class' as const, attributes: [], methods: [], literals: [] } },
    ]
    const exported = buildEnterpriseArchitectXmi('enum-use', nodes, [{ id: 'uses-status', source: 'status', target: 'user', data: { relationType: 'enumUsage' as const, sourceMultiplicity: '1', targetMultiplicity: '1' } }])
    expect(exported).toContain('xmi:type="uml:Dependency"')
    expect(exported).toContain('stereotype="use"')
    const content = parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>'))

    expect(content.connections).toEqual([expect.objectContaining({ id: 'uses-status', type: 'dependency', stereotype: 'use', usage: 'enum', sourceId: 'user', targetId: 'status' })])
  })

  it('exports abstract classifiers as uml:Class and round-trips member semantics', () => {
    const exported = buildEnterpriseArchitectXmi('semantics', [
      { id: 'base', position: { x: 20, y: 30 }, data: { name: 'Base', kind: 'abstract' as const, attributes: ['-count: int'], methods: ['+reset(): void'], attributeSemantics: [{ visibility: '-', isStatic: true, isDerived: true, defaultValue: '0' }], methodSemantics: [{ visibility: '+', isAbstract: true }] } },
    ], [])

    expect(exported).toContain('xmi:type="uml:Class"')
    expect(exported).toContain('isAbstract="true"')
    expect(exported).not.toContain('uml:AbstractClass')
    const content = parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>'))

    expect(content.elements?.[0]).toMatchObject({ type: 'uml.Class', isAbstract: true, attributeSemantics: [{ isStatic: true, isDerived: true, defaultValue: '0' }], methodSemantics: [{ isAbstract: true }] })
  })

  it('round-trips association roles, navigability, and UMLDI waypoints', () => {
    const exported = buildEnterpriseArchitectXmi('roles', [
      { id: 'a', position: { x: 0, y: 0 }, data: { name: 'A', kind: 'class' as const, attributes: [], methods: [] } },
      { id: 'b', position: { x: 300, y: 0 }, data: { name: 'B', kind: 'class' as const, attributes: [], methods: [] } },
    ], [{ id: 'ab', source: 'a', target: 'b', data: { relationType: 'association' as const, sourceMultiplicity: '1', targetMultiplicity: '0..*', sourceRoleName: 'owner', targetRoleName: 'items', sourceNavigable: true, targetNavigable: false, waypoints: [{ x: 100, y: 60 }, { x: 200, y: 70 }] } }])
    const content = parseDiagramXmi(exported.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>'))

    expect(content.connections).toEqual([expect.objectContaining({ sourceRoleName: 'owner', targetRoleName: 'items', sourceNavigable: true, targetNavigable: false, waypoints: [{ x: 100, y: 60 }, { x: 200, y: 70 }] })])
  })

  it('imports the supplied test1.xmi fixture without diagram artifacts', () => {
    const fixture = readFileSync(resolve(process.cwd(), '../test1.xmi'), 'utf8')
    // happy-dom does not close XML self-closing tags correctly; preserve the real fixture content for its XML parser.
    const xml = fixture.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>')
    const content = parseDiagramXmi(xml)

    expect(content.elements).toHaveLength(20)
    expect(content.elements?.filter((element) => element.type === 'uml.Enumeration')).toHaveLength(6)
    expect(content.elements?.find((element) => element.name === 'MembershipStatus')?.literals).toEqual(['ACTIVE', 'CACELLED', 'EXPIRED'])
    expect(content.elements?.find((element) => element.name === 'Payment')?.attributes).toContain('-status: MembershipStatus [1]')
    expect(content.connections).toHaveLength(11)
    expect(content.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'inheritance' }),
      expect.objectContaining({ type: 'implementation' }),
      expect.objectContaining({ type: 'composition' }),
      expect.objectContaining({ type: 'aggregation' }),
    ]))
    expect(content.elements?.some((element) => element.name === 'test1')).toBe(false)
    expect(content.elements?.some((element) => element.name === 'int')).toBe(false)
  })
})

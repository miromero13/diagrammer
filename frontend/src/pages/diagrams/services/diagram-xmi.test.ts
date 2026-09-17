import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildEnterpriseArchitectXmi } from '../components/diagram-export-dropdown'
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

  it('imports the supplied test1.xmi fixture without diagram artifacts', () => {
    const fixture = readFileSync(resolve(process.cwd(), '../test1.xmi'), 'utf8')
    // happy-dom does not close XML self-closing tags correctly; preserve the real fixture content for its XML parser.
    const xml = fixture.replace(/<([A-Za-z][\w:.-]*)([^>]*)\/>/g, '<$1$2></$1>')
    const content = parseDiagramXmi(xml)

    expect(content.elements).toHaveLength(20)
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

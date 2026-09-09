import type { DiagramContent } from '../models/diagram.model'

const stripPrefix = (value: string) => value.replace(/^<<interface>>\n|^<<abstract>>\n/, '')

const getText = (node: Element | null | undefined) => (node?.textContent ?? '').trim()

const normalizeKind = (element: Element) => {
  const type = (element.getAttribute('type') ?? element.getAttribute('xmi:type') ?? '').toLowerCase()
  const stereotype = (element.getAttribute('stereotype') ?? '').toLowerCase()

  if (type.includes('interface') || stereotype.includes('interface')) return 'interface'
  if (type.includes('abstract') || stereotype.includes('abstract')) return 'abstract'
  return 'class'
}

const getElements = (root: ParentNode, selector: string) => Array.from(root.querySelectorAll(selector))

export const parseDiagramXmi = (xml: string): DiagramContent => {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = document.querySelector('parsererror')
  if (parserError) {
    throw new Error('El archivo XMI no es válido')
  }

  const rawElements = getElements(document, 'element, packagedElement').filter((element) => {
    const tag = element.tagName.toLowerCase()
    const type = (element.getAttribute('type') ?? element.getAttribute('xmi:type') ?? '').toLowerCase()
    return tag === 'element' || type.includes('class') || type.includes('interface') || type.includes('abstract')
  })

  const elements = rawElements.map((element, index) => {
    const kind = normalizeKind(element)
    const attributes = getElements(element, 'attributes > attribute, ownedAttribute').map((attribute) => getText(attribute)).filter(Boolean)
    const methods = getElements(element, 'methods > method, ownedOperation').map((method) => getText(method)).filter(Boolean)
    const x = 80 + (index % 3) * 320
    const y = 80 + Math.floor(index / 3) * 260

    return {
      id: element.getAttribute('xmi.id') ?? element.getAttribute('id') ?? `imported-${index}`,
      type: kind === 'interface' ? 'uml.Interface' : kind === 'abstract' ? 'uml.AbstractClass' : 'uml.Class',
      name: stripPrefix(element.getAttribute('name') ?? 'Class'),
      attributes,
      methods,
      position: { x, y },
      size: { width: 260, height: 120 + Math.max(attributes.length, methods.length) * 20 },
    }
  })

  const connections = getElements(document, 'connector').map((connector, index) => ({
    id: connector.getAttribute('xmi.id') ?? connector.getAttribute('id') ?? `imported-connector-${index}`,
    type: connector.getAttribute('type') ?? 'association',
    sourceId: connector.getAttribute('source') ?? connector.getAttribute('sourceId') ?? '',
    targetId: connector.getAttribute('target') ?? connector.getAttribute('targetId') ?? '',
    source: connector.getAttribute('source') ?? connector.getAttribute('sourceId') ?? '',
    target: connector.getAttribute('target') ?? connector.getAttribute('targetId') ?? '',
    sourceMultiplicity: connector.getAttribute('sourceMultiplicity') ?? '1',
    targetMultiplicity: connector.getAttribute('targetMultiplicity') ?? '1',
  })).filter((connection) => connection.sourceId && connection.targetId)

  return {
    elements,
    connections,
    metadata: {
      version: 'reactflow',
      lastModified: new Date().toISOString(),
      elementsCount: elements.length,
      linksCount: connections.length,
    },
  }
}

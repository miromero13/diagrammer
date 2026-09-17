import type { DiagramContent } from '../models/diagram.model'

const stripPrefix = (value: string) => value.replace(/^<<interface>>\n|^<<abstract>>\n/, '')
const local = (element: Element) => (element.localName || element.tagName.split(':').pop() || '').toLowerCase()
const children = (element: Element, name: string) => Array.from(element.children).filter((child) => local(child) === name.toLowerCase())
const descendants = (root: ParentNode, name: string) => Array.from(root.querySelectorAll('*')).filter((element) => local(element) === name.toLowerCase())

const attr = (element: Element | null | undefined, ...names: string[]) => {
  if (!element) return ''
  for (const name of names) {
    const value = element.getAttribute(name)
    if (value !== null && value !== '') return value
  }
  for (const attribute of Array.from(element.attributes)) {
    if (names.includes(attribute.localName)) return attribute.value
  }
  return ''
}

const ref = (value: string) => value.trim().replace(/^#/, '').split('#').pop() ?? ''
const text = (element: Element | null | undefined) => (element?.textContent ?? '').trim()
const typeName = (element: Element, lookup: Map<string, Element>) => {
  const value = ref(attr(element, 'type'))
  return lookup.get(value)?.getAttribute('name') || value || 'type'
}
const visibility = (value: string) => ({ public: '+', private: '-', protected: '#', package: '~' }[value] ?? '')
const multiplicity = (element: Element) => {
  const lower = children(element, 'lowerValue')[0]
  const upper = children(element, 'upperValue')[0]
  const low = attr(lower, 'value') || '1'
  const high = attr(upper, 'value') || '1'
  return low === high ? low : `${low}..${high}`
}

const normalizeKind = (element: Element) => {
  const type = attr(element, 'xmi:type', 'type').toLowerCase()
  const stereotype = attr(element, 'stereotype').toLowerCase()
  if (type.includes('interface') || stereotype.includes('interface')) return 'interface'
  if (type.includes('abstract') || stereotype.includes('abstract') || attr(element, 'isAbstract') === 'true') return 'abstract'
  return 'class'
}

const relation = (id: string, type: string, source: string, target: string, sourceMultiplicity = '1', targetMultiplicity = '1') => ({
  id, type, sourceId: source, targetId: target, source, target, sourceMultiplicity, targetMultiplicity,
})

export const parseDiagramXmi = (xml: string): DiagramContent => {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  if (document.querySelector('parsererror')) throw new Error('El archivo XMI no es válido')

  const all = Array.from(document.querySelectorAll('*'))
  const byId = new Map<string, Element>()
  const byName = new Map<string, Element>()
  all.forEach((element) => {
    const id = attr(element, 'xmi:id', 'xmi.id', 'id')
    if (id) byId.set(id, element)
    const name = attr(element, 'name')
    if (name) byName.set(name, element)
    const qualifiedName = attr(element, 'qualifiedName')
    if (qualifiedName) byName.set(qualifiedName, element)
  })
  const resolve = (value: string) => {
    const key = ref(value)
    return byId.get(key) || byName.get(key) || byName.get(value)
  }
  const classifierTypes = new Set(['class', 'interface', 'enumeration', 'associationclass', 'signal', 'component', 'actor', 'usecase', 'datatype'])
  const classifiers = all.filter((element) => {
    const type = attr(element, 'xmi:type', 'type').split(':').pop()?.toLowerCase() ?? ''
    return (local(element) === 'element' || local(element) === 'packagedelement') && (local(element) === 'element' || classifierTypes.has(type))
  })
  const classifierIds = new Set(classifiers.map((element) => attr(element, 'xmi:id', 'xmi.id', 'id')).filter(Boolean))
  const bounds = new Map<string, { x: number, y: number, width: number, height: number }>()
  descendants(document, 'ownedElement').forEach((shape) => {
    const modelId = ref(attr(shape, 'modelElement'))
    const bound = children(shape, 'bounds')[0]
    if (!modelId || !bound) return
    const values = ['x', 'y', 'width', 'height'].map((name) => Number(attr(bound, name)))
    if (values.every(Number.isFinite)) bounds.set(modelId, { x: values[0], y: values[1], width: values[2], height: values[3] })
  })
  const placed = classifiers.map((element) => bounds.get(attr(element, 'xmi:id', 'xmi.id', 'id'))).filter(Boolean) as Array<{ x: number, y: number, width: number, height: number }>
  const minX = placed.length ? Math.min(...placed.map((item) => item.x)) : 0
  const minY = placed.length ? Math.min(...placed.map((item) => item.y)) : 0

  const elements = classifiers.map((element, index) => {
    const id = attr(element, 'xmi:id', 'xmi.id', 'id') || `imported-${index}`
    const kind = normalizeKind(element)
    const customAttributes = children(element, 'attributes').flatMap((group) => children(group, 'attribute'))
    const attributes = (customAttributes.length ? customAttributes : children(element, 'ownedAttribute').filter((item) => !attr(item, 'association'))).map((item) => {
      const name = attr(item, 'name') || text(item)
      const type = typeName(item, byId)
      const value = customAttributes.length ? name : `${visibility(attr(item, 'visibility'))}${name}${type && name !== text(item) ? `: ${type}` : ''}`
      return `${value}${children(item, 'lowerValue').length ? ` [${multiplicity(item)}]` : ''}`
    }).filter(Boolean)
    if (attr(element, 'type').toLowerCase().includes('enumeration')) {
      children(element, 'ownedLiteral').forEach((literal) => attributes.push(attr(literal, 'name') || text(literal)))
    }
    const customMethods = children(element, 'methods').flatMap((group) => children(group, 'method'))
    const methods = (customMethods.length ? customMethods : children(element, 'ownedOperation')).map((item) => {
      const name = attr(item, 'name') || text(item)
      if (customMethods.length) return name
      const parameters = children(item, 'ownedParameter').filter((parameter) => attr(parameter, 'direction') !== 'return').map((parameter) => `${attr(parameter, 'name') || 'param'}: ${typeName(parameter, byId)}`).join(', ')
      const returnParameter = children(item, 'ownedParameter').find((parameter) => attr(parameter, 'direction') === 'return')
      return `${visibility(attr(item, 'visibility'))}${name}(${parameters})${returnParameter ? `: ${typeName(returnParameter, byId)}` : ''}`
    }).filter(Boolean)
    const box = bounds.get(id)
    return {
      id, type: kind === 'interface' ? 'uml.Interface' : kind === 'abstract' ? 'uml.AbstractClass' : 'uml.Class',
      name: stripPrefix(attr(element, 'name') || 'Class'), attributes, methods,
      position: box ? { x: box.x - minX + 80, y: box.y - minY + 80 } : { x: 80 + (index % 3) * 320, y: 80 + Math.floor(index / 3) * 260 },
      size: box ? { width: box.width, height: box.height } : { width: 260, height: 120 + Math.max(attributes.length, methods.length) * 20 },
    }
  })

  const resolveNode = (value: string) => {
    const item = resolve(value)
    const id = item && attr(item, 'xmi:id', 'xmi.id', 'id')
    return id && classifierIds.has(id) ? id : item && classifierIds.has(attr(item, 'xmi:id', 'xmi.id', 'id')) ? attr(item, 'xmi:id', 'xmi.id', 'id') : ''
  }
  const connections: Array<ReturnType<typeof relation>> = []
  const seen = new Set<string>()
  const add = (item: ReturnType<typeof relation>) => {
    if (!classifierIds.has(item.sourceId) || !classifierIds.has(item.targetId) || item.sourceId === item.targetId) return
    const key = `${item.type}|${item.sourceId}|${item.targetId}`
    if (seen.has(key)) return
    seen.add(key); connections.push(item)
  }
  descendants(document, 'connector').forEach((item, index) => add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `connector-${index}`, attr(item, 'type') || 'association', resolveNode(attr(item, 'source', 'sourceId')), resolveNode(attr(item, 'target', 'targetId')), attr(item, 'sourceMultiplicity') || '1', attr(item, 'targetMultiplicity') || '1')))
  classifiers.forEach((owner) => {
    const ownerId = attr(owner, 'xmi:id', 'xmi.id', 'id')
    children(owner, 'generalization').forEach((item, index) => add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `generalization-${index}`, 'inheritance', ownerId, resolveNode(attr(item, 'general')))))
    children(owner, 'interfaceRealization').forEach((item, index) => add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `implementation-${index}`, 'implementation', resolveNode(attr(item, 'client')) || ownerId, resolveNode(attr(item, 'supplier', 'contract')))))
  })
  all.filter((item) => ['generalization', 'interfacerealization'].includes(local(item))).forEach((item, index) => {
    const type = local(item) === 'generalization' ? 'inheritance' : 'implementation'
    const source = resolveNode(attr(item, 'specific', 'client'))
    const target = resolveNode(attr(item, 'general', 'supplier', 'contract'))
    add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `${type}-${index}`, type, source, target))
  })
  all.filter((item) => attr(item, 'xmi:type', 'type').split(':').pop()?.toLowerCase() === 'dependency').forEach((item, index) => add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `dependency-${index}`, 'dependency', resolveNode(attr(item, 'client')), resolveNode(attr(item, 'supplier')))))
  all.filter((item) => ['association', 'associationclass'].includes(attr(item, 'xmi:type', 'type').split(':').pop()?.toLowerCase() ?? '')).forEach((item, index) => {
    const ends = children(item, 'ownedEnd')
    const memberIds = children(item, 'memberEnd').map((member) => ref(attr(member, 'xmi:idref', 'idref')))
    const ordered = memberIds.length ? memberIds.map((id) => ends.find((end) => attr(end, 'xmi:id', 'xmi.id', 'id') === id)).filter(Boolean) as Element[] : ends
    if (ordered.length < 2) return
    const kind = attr(ordered[0], 'aggregation') === 'composite' ? 'composition' : attr(ordered[0], 'aggregation') === 'shared' ? 'aggregation' : 'association'
    add(relation(attr(item, 'xmi:id', 'xmi.id', 'id') || `association-${index}`, kind, resolveNode(attr(ordered[0], 'type')), resolveNode(attr(ordered[1], 'type')), multiplicity(ordered[0]), multiplicity(ordered[1])))
  })

  return { elements, connections, metadata: { version: 'reactflow', lastModified: new Date().toISOString(), elementsCount: elements.length, linksCount: connections.length } }
}

import type { DiagramContent } from './models/diagram.model'

const isManyMultiplicity = (value?: string) => {
  const normalized = value?.trim().toLowerCase() ?? ''
  return normalized === '*' || normalized === 'many' || normalized.endsWith('..*') || normalized.endsWith('..many')
}

export const isManyToManyConnection = (connection: NonNullable<DiagramContent['connections']>[number]) =>
  !connection.associationClassLink && isManyMultiplicity(connection.sourceMultiplicity) && isManyMultiplicity(connection.targetMultiplicity)

const cleanName = (value?: string) => (value ?? 'Class').replace(/^<<interface>>\n|^<<abstract>>\n/, '').trim() || 'Class'

export const manyToManyName = (sourceName?: string, targetName?: string) => `${cleanName(sourceName)}${cleanName(targetName)}`

export const materializeManyToMany = (content: DiagramContent): DiagramContent => {
  const originalConnections = content.connections ?? []
  const activeAssociationClassIds = new Set(
    originalConnections
      .filter((connection) => !connection.associationClassLink && isManyToManyConnection(connection))
      .map((connection) => `${String(connection.id ?? '')}-association-class`),
  )
  const elements = (content.elements ?? [])
    .filter((element) => !String(element.id ?? '').endsWith('-association-class') || activeAssociationClassIds.has(String(element.id)))
    .map((element) => ({ ...element }))
  const elementsById = new Map(elements.map((element) => [String(element.id ?? ''), element]))
  const connections: NonNullable<DiagramContent['connections']> = []

  for (const connection of originalConnections) {
    if (connection.associationClassLink) continue
    if (!isManyToManyConnection(connection)) {
      const { associationClassId: _associationClassId, associationClassLink: _associationClassLink, ...plainConnection } = connection
      connections.push(plainConnection)
      continue
    }

    const sourceId = String(connection.sourceId ?? (typeof connection.source === 'string' ? connection.source : connection.source?.id ?? ''))
    const targetId = String(connection.targetId ?? (typeof connection.target === 'string' ? connection.target : connection.target?.id ?? ''))
    const source = elementsById.get(sourceId)
    const target = elementsById.get(targetId)
    if (!source || !target) {
      connections.push({ ...connection })
      continue
    }

    const baseId = String(connection.id ?? `${sourceId}-${targetId}`)
    const intermediateId = `${baseId}-association-class`
    connections.push({ ...connection, associationClassId: intermediateId, associationClassLink: false })
    if (!elementsById.has(intermediateId)) {
      const sourcePosition = source.position ?? { x: 80, y: 80 }
      const targetPosition = target.position ?? { x: sourcePosition.x + 320, y: sourcePosition.y }
      const name = manyToManyName(source.name, target.name)
      const intermediate = {
        id: intermediateId,
        type: 'uml.Class',
        name,
        attributes: [],
        methods: [],
        position: {
          x: (sourcePosition.x + targetPosition.x) / 2,
          y: (sourcePosition.y + targetPosition.y) / 2 + 140,
        },
        size: { width: 260, height: 120 },
      }
      elements.push(intermediate)
      elementsById.set(intermediateId, intermediate)
    }

  }

  return {
    ...content,
    elements,
    connections,
    metadata: content.metadata ? { ...content.metadata } : content.metadata,
  }
}

export type HandleSide = 'top' | 'right' | 'bottom' | 'left'
export type HandleType = 'source' | 'target'

export type HandleSlots = Record<HandleType, Record<HandleSide, number>>

type PositionedNode = {
  id: string
  position: { x: number; y: number }
}

type Relationship = {
  id: string
  source: string
  target: string
}

const emptySlots = (): HandleSlots => ({
  source: { top: 1, right: 1, bottom: 1, left: 1 },
  target: { top: 1, right: 1, bottom: 1, left: 1 },
})

const sideToward = (from: PositionedNode, to: PositionedNode): HandleSide => {
  const x = to.position.x - from.position.x
  const y = to.position.y - from.position.y
  if (Math.abs(x) >= Math.abs(y)) return x >= 0 ? 'right' : 'left'
  return y >= 0 ? 'bottom' : 'top'
}

const oppositeSide = (side: HandleSide): HandleSide => ({ top: 'bottom', right: 'left', bottom: 'top', left: 'right' } as const)[side]

export const distributeHandles = (nodes: PositionedNode[], edges: Relationship[]) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const nodeHandles = Object.fromEntries(nodes.map((node) => [node.id, emptySlots()])) as Record<string, HandleSlots>
  const sideSlots = Object.fromEntries(nodes.map((node) => [node.id, { top: 1, right: 1, bottom: 1, left: 1 }])) as Record<string, Record<HandleSide, number>>
  const edgeHandles: Record<string, { sourceHandle: string; targetHandle: string }> = {}

  edges
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .forEach((edge) => {
      const source = nodesById.get(edge.source)
      const target = nodesById.get(edge.target)
      if (!source || !target) return

      const sourceSide = source === target ? 'right' : sideToward(source, target)
      const targetSide = source === target ? 'left' : oppositeSide(sourceSide)
      const sourceSlot = sideSlots[source.id][sourceSide]++
      const targetSlot = sideSlots[target.id][targetSide]++
      nodeHandles[source.id].source[sourceSide] = sideSlots[source.id][sourceSide]
      nodeHandles[source.id].target[sourceSide] = sideSlots[source.id][sourceSide]
      nodeHandles[target.id].source[targetSide] = sideSlots[target.id][targetSide]
      nodeHandles[target.id].target[targetSide] = sideSlots[target.id][targetSide]
      edgeHandles[edge.id] = {
        sourceHandle: `source-${sourceSide}-${sourceSlot}`,
        targetHandle: `target-${targetSide}-${targetSlot}`,
      }
    })

  return { nodeHandles, edgeHandles }
}

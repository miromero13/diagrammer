import { describe, expect, it } from 'vitest'

import { equivalentDiagramContent } from './index'

describe('equivalentDiagramContent', () => {
  it('treats object key order and normalized many-to-many content as equivalent', () => {
    const left = {
      elements: [{ id: 'a', type: 'uml.Class', name: 'A', position: { x: 1, y: 2 } }],
      connections: [{ id: 'edge', sourceId: 'a', targetId: 'b', source: 'a', target: 'b', type: 'association', sourceMultiplicity: '1', targetMultiplicity: '1' }],
      metadata: { lastModified: 'old' },
    }
    const right = {
      metadata: { lastModified: 'new' },
      connections: [{ target: 'b', source: 'a', targetId: 'b', sourceId: 'a', type: 'association', id: 'edge', targetMultiplicity: '1', sourceMultiplicity: '1' }],
      elements: [{ position: { y: 2, x: 1 }, name: 'A', type: 'uml.Class', id: 'a' }],
    }

    expect(equivalentDiagramContent(left, right)).toBe(true)
  })

  it('detects actual element and connection differences', () => {
    const baseline = { elements: [{ id: 'a', name: 'A' }], connections: [], metadata: {} }
    expect(equivalentDiagramContent(baseline, { ...baseline, elements: [{ id: 'a', name: 'Changed' }] })).toBe(false)
    expect(equivalentDiagramContent(baseline, { ...baseline, connections: [{ id: 'edge' }] } as any)).toBe(false)
  })
})

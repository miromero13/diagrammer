import { describe, expect, it } from 'vitest'

import { distributeHandles } from './handle-distribution'

describe('distributeHandles', () => {
  it('assigns deterministic slots on the sides facing each related node', () => {
    const result = distributeHandles(
      [
        { id: 'a', position: { x: 0, y: 0 } },
        { id: 'b', position: { x: 300, y: 0 } },
        { id: 'c', position: { x: 300, y: 100 } },
      ],
      [
        { id: 'z-edge', source: 'a', target: 'c' },
        { id: 'a-edge', source: 'a', target: 'b' },
      ],
    )

    expect(result.edgeHandles).toEqual({
      'a-edge': { sourceHandle: 'source-right-1', targetHandle: 'target-left-1' },
      'z-edge': { sourceHandle: 'source-right-2', targetHandle: 'target-left-1' },
    })
    expect(result.nodeHandles.a.source.right).toBe(3)
    expect(result.nodeHandles.b.target.left).toBe(2)
  })

  it('uses vertical sides and reserves one handle per side for new connections', () => {
    const result = distributeHandles(
      [{ id: 'top', position: { x: 0, y: 0 } }, { id: 'bottom', position: { x: 0, y: 300 } }],
      [{ id: 'edge', source: 'bottom', target: 'top' }],
    )

    expect(result.edgeHandles.edge).toEqual({ sourceHandle: 'source-top-1', targetHandle: 'target-bottom-1' })
    expect(result.nodeHandles.top.source.left).toBe(1)
    expect(result.nodeHandles.bottom.target.right).toBe(1)
  })

  it('shares side slots between incoming and outgoing relationships', () => {
    const result = distributeHandles(
      [{ id: 'a', position: { x: 0, y: 0 } }, { id: 'b', position: { x: 300, y: 0 } }],
      [{ id: 'incoming', source: 'b', target: 'a' }, { id: 'outgoing', source: 'a', target: 'b' }],
    )

    expect(result.edgeHandles.incoming.targetHandle).toBe('target-right-1')
    expect(result.edgeHandles.outgoing.sourceHandle).toBe('source-right-2')
    expect(result.nodeHandles.a).toMatchObject({ source: { right: 3 }, target: { right: 3 } })
  })
})

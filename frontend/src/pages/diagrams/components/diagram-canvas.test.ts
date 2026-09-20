import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'

import { getBadgePosition } from './diagram-canvas'

describe('multiplicity badge position', () => {
  it('places every badge outside its owning handle', () => {
    expect(getBadgePosition(100, 100, Position.Top)).toEqual({ x: 116, y: 80 })
    expect(getBadgePosition(100, 100, Position.Bottom)).toEqual({ x: 116, y: 120 })
    expect(getBadgePosition(100, 100, Position.Left)).toEqual({ x: 80, y: 88 })
    expect(getBadgePosition(100, 100, Position.Right)).toEqual({ x: 120, y: 88 })
  })
})

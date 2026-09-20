import { describe, expect, it } from 'vitest'
import { Position } from '@xyflow/react'

import { getBadgePosition } from './diagram-canvas'

describe('multiplicity badge position', () => {
  it('places every badge outside its owning handle', () => {
    expect(getBadgePosition(100, 100, Position.Top)).toEqual({ x: 121, y: 70 })
    expect(getBadgePosition(100, 100, Position.Bottom)).toEqual({ x: 121, y: 130 })
    expect(getBadgePosition(100, 100, Position.Left)).toEqual({ x: 75, y: 78 })
    expect(getBadgePosition(100, 100, Position.Right)).toEqual({ x: 125, y: 78 })
  })
})

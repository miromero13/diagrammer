import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DiagramElementsSidebar, UmlRelationPreview } from './diagram-elements-sidebar'

describe('DiagramElementsSidebar', () => {
  it('renders an accessible UML card for every element button', () => {
    render(<DiagramElementsSidebar tool="select" onAddNode={() => {}} onToolChange={() => {}} />)

    expect(screen.getByRole('button', { name: /^clase$/i })).toHaveTextContent('Customer')
    expect(screen.getByRole('button', { name: /^enum$/i })).toHaveTextContent('ACTIVE')
    expect(screen.getByRole('button', { name: /^interfaz$/i })).toHaveTextContent('«interface» Service')
    expect(screen.getByRole('button', { name: /^clase abstracta$/i })).toHaveTextContent('«abstract» BaseEntity')
  })

  it('keeps the element creation callback behavior', () => {
    const onAddNode = vi.fn()
    const onToolChange = vi.fn()
    render(<DiagramElementsSidebar tool="select" onAddNode={onAddNode} onToolChange={onToolChange} />)

    fireEvent.click(screen.getByRole('button', { name: /^interfaz$/i }))

    expect(onToolChange).toHaveBeenCalledWith('interface')
    expect(onAddNode).toHaveBeenCalledWith('interface')
  })

  it.each([
    ['association', undefined],
    ['dependency', '6 4'],
    ['enumUsage', '6 4'],
    ['inheritance', undefined],
    ['implementation', '6 4'],
    ['composition', undefined],
    ['aggregation', undefined],
  ] as const)('renders the %s line semantics', (relation, dash) => {
    const { container } = render(<UmlRelationPreview relation={relation} />)

    if (dash) expect(container.querySelector('line')).toHaveAttribute('stroke-dasharray', dash)
    else expect(container.querySelector('line')).not.toHaveAttribute('stroke-dasharray')
    expect(container.querySelectorAll('path')).toHaveLength(['association'].includes(relation) ? 0 : 1)
  })
})

import { describe, expect, it } from 'vitest'

import { isManyToManyConnection, manyToManyName, materializeManyToMany } from './many-to-many'

const content = {
  elements: [
    { id: 'user', name: 'User', position: { x: 0, y: 0 } },
    { id: 'role', name: 'Role', position: { x: 320, y: 0 } },
  ],
  connections: [{ id: 'user-role', type: 'association', sourceId: 'user', targetId: 'role', sourceMultiplicity: '0..*', targetMultiplicity: '0..*' }],
}

describe('many-to-many materialization', () => {
  it('detects many-to-many multiplicities and names the association class deterministically', () => {
    expect(isManyToManyConnection(content.connections[0])).toBe(true)
    expect(manyToManyName('User', 'Role')).toBe('UserRole')
  })

  it('creates one editable UML classifier and two links without duplicating on repeat', () => {
    const materialized = materializeManyToMany(content)
    const repeated = materializeManyToMany(materialized)

    expect(materialized.elements).toHaveLength(3)
    expect(materialized.elements?.find((element) => element.name === 'UserRole')).toMatchObject({ type: 'uml.Class', attributes: [] })
    expect(materialized.connections).toHaveLength(1)
    expect(materialized.connections?.find((connection) => connection.id === 'user-role')).toMatchObject({ sourceMultiplicity: '0..*', targetMultiplicity: '0..*' })
    expect(repeated).toEqual(materialized)
  })

  it('keeps association-class attributes and name editable through persistence', () => {
    const materialized = materializeManyToMany(content)
    const edited = {
      ...materialized,
      elements: materialized.elements?.map((element) => element.name === 'UserRole' ? { ...element, name: 'Membership', attributes: ['+assignedAt: Date'] } : element),
    }

    expect(materializeManyToMany(edited).elements?.find((element) => element.id === 'user-role-association-class')).toMatchObject({ name: 'Membership', attributes: ['+assignedAt: Date'] })
  })

  it('keeps only the direct many-to-many line', () => {
    const materialized = materializeManyToMany(content)
    expect(materialized.connections).toHaveLength(1)
    expect(materialized.connections?.[0]).toMatchObject({ associationClassId: 'user-role-association-class', associationClassLink: false })
  })

  it('removes the intermediate class when the original relation changes to one-to-many', () => {
    const materialized = materializeManyToMany(content)
    const edited = {
      ...materialized,
      connections: materialized.connections?.map((connection) => connection.id === 'user-role'
        ? { ...connection, sourceMultiplicity: '1', targetMultiplicity: '0..*' }
        : connection),
    }

    const normalized = materializeManyToMany(edited)
    expect(normalized.elements).toHaveLength(2)
    expect(normalized.connections).toHaveLength(1)
    expect(normalized.connections?.[0]).toMatchObject({ id: 'user-role', sourceMultiplicity: '1', targetMultiplicity: '0..*' })
  })
})

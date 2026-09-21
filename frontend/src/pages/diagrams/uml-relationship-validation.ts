export type UmlRelationshipKind = 'class' | 'interface' | 'abstract' | 'enum'

export type UmlRelationshipValidationInput = {
  type: string
  sourceId: string
  targetId: string
  sourceKind?: UmlRelationshipKind
  targetKind?: UmlRelationshipKind
  sourceMultiplicity?: string
  targetMultiplicity?: string
  usage?: string
  stereotype?: string
}

export type UmlMultiplicity = { lower: number, upper: number | null }

export const normalizeUmlMultiplicity = (value?: string): UmlMultiplicity | null | undefined => {
  const raw = value?.trim() ?? ''
  if (!raw) return null
  if (raw === '*') return { lower: 0, upper: null }

  const exact = raw.match(/^(\d+)$/)
  if (exact) {
    const number = Number(exact[1])
    return { lower: number, upper: number }
  }

  const range = raw.match(/^(\d+)\.\.(\d+|\*)$/)
  if (!range) return undefined

  const lower = Number(range[1])
  const upper = range[2] === '*' ? null : Number(range[2])
  if (upper !== null && upper < lower) {
    return lower === 1 && upper === 0 ? { lower: 0, upper: 1 } : undefined
  }
  return { lower, upper }
}

const classLike = (kind?: UmlRelationshipKind) => kind === 'class' || kind === 'abstract'

export const validateUmlRelationship = (input: UmlRelationshipValidationInput) => {
  const errors: string[] = []
  const type = input.type === 'enumUsage' ? 'dependency' : input.type
  if (!input.sourceId || !input.sourceKind) errors.push('La relación necesita un origen UML válido.')
  if (!input.targetId || !input.targetKind) errors.push('La relación necesita un destino UML válido.')
  if (input.sourceId && input.sourceId === input.targetId) errors.push('Una relación no puede conectar un elemento consigo mismo.')
  ;[['origen', input.sourceMultiplicity], ['destino', input.targetMultiplicity]].forEach(([side, value]) => {
    const normalized = normalizeUmlMultiplicity(value)
    const range = value?.trim().match(/^(\d+)\.\.(\d+)$/)
    const reversed = Boolean(range && Number(range[2]) < Number(range[1]) && !(range[1] === '1' && range[2] === '0'))
    if (normalized !== undefined) return
    if (reversed) {
      errors.push(`La multiplicidad de ${side} no puede tener un límite superior menor que el inferior.`)
    } else if (value) {
      errors.push(`La multiplicidad de ${side} debe usar n, n..m, n..* o *.`)
    }
  })
  if (type === 'inheritance' && (!classLike(input.sourceKind) || !classLike(input.targetKind))) errors.push('La herencia requiere clases o clases abstractas en ambos extremos.')
  if (type === 'implementation' && (!classLike(input.sourceKind) || input.targetKind !== 'interface')) errors.push('La implementación requiere una clase concreta y una interfaz.')
  if (['association', 'aggregation', 'composition'].includes(type) && (!classLike(input.sourceKind) || !classLike(input.targetKind))) errors.push(`La ${type === 'composition' ? 'composición' : type === 'aggregation' ? 'agregación' : 'asociación'} requiere clases o clases abstractas en ambos extremos.`)
  const sourceMultiplicity = normalizeUmlMultiplicity(input.sourceMultiplicity)
  if (type === 'composition' && sourceMultiplicity && (sourceMultiplicity.upper === null || sourceMultiplicity.upper > 1)) errors.push('La composición necesita como máximo un composite propietario en el extremo origen.')
  const isEnumUsage = input.type === 'enumUsage' || input.usage === 'enum' || input.stereotype === 'use'
  if (isEnumUsage && (!classLike(input.sourceKind) || input.targetKind !== 'enum')) errors.push('La dependencia «use» debe ir de una clase hacia un enum.')
  return errors
}

export type UmlRelationshipKind = 'class' | 'interface' | 'abstract' | 'enum'

export type UmlRelationshipValidationInput = {
  type: string
  sourceId: string
  targetId: string
  sourceKind?: UmlRelationshipKind
  targetKind?: UmlRelationshipKind
  sourceMultiplicity?: string
  targetMultiplicity?: string
}

const multiplicity = /^(?:\d+|\d+\.\.(?:\d+|\*)|\*)$/
const classLike = (kind?: UmlRelationshipKind) => kind === 'class' || kind === 'abstract'

export const validateUmlRelationship = (input: UmlRelationshipValidationInput) => {
  const errors: string[] = []
  const type = input.type === 'enumUsage' ? 'dependency' : input.type
  if (!input.sourceId || !input.sourceKind) errors.push('La relación necesita un origen UML válido.')
  if (!input.targetId || !input.targetKind) errors.push('La relación necesita un destino UML válido.')
  if (input.sourceId && input.sourceId === input.targetId) errors.push('Una relación no puede conectar un elemento consigo mismo.')
  ;[['origen', input.sourceMultiplicity], ['destino', input.targetMultiplicity]].forEach(([side, value]) => {
    if (value && !multiplicity.test(value)) errors.push(`La multiplicidad de ${side} debe usar n, n..m o n..*.`)
    if (value?.includes('..')) {
      const [lower, upper] = value.split('..')
      if (upper !== '*' && Number(upper) < Number(lower)) errors.push(`La multiplicidad de ${side} no puede tener un límite superior menor que el inferior.`)
    }
  })
  if (type === 'inheritance' && (!classLike(input.sourceKind) || !classLike(input.targetKind))) errors.push('La herencia requiere clases o clases abstractas en ambos extremos.')
  if (type === 'implementation' && (!classLike(input.sourceKind) || input.targetKind !== 'interface')) errors.push('La implementación requiere una clase concreta y una interfaz.')
  if (['association', 'aggregation', 'composition'].includes(type) && (!classLike(input.sourceKind) || !classLike(input.targetKind))) errors.push(`La ${type === 'composition' ? 'composición' : type === 'aggregation' ? 'agregación' : 'asociación'} requiere clases o clases abstractas en ambos extremos.`)
  if (type === 'composition' && input.sourceMultiplicity && (!input.sourceMultiplicity.endsWith('..1') && input.sourceMultiplicity !== '1')) errors.push('La composición necesita como máximo un composite propietario en el extremo origen.')
  if (type === 'dependency' && (input.sourceKind === 'enum' || input.targetKind === 'enum') && (input.sourceKind !== 'class' && input.sourceKind !== 'abstract' || input.targetKind !== 'enum')) errors.push('La dependencia «use» debe ir de una clase hacia un enum.')
  return errors
}

const identifier = '[A-Za-z_$][\\w$]*'
const type = `${identifier}(?:<${identifier}>)?(?:\\[\\])?`
const multiplicity = '(?:\\d+|\\d+\\.\\.(?:\\d+|\\*))'

const attributePattern = new RegExp(`^[+\\-#~]?\\s*${identifier}(?:\\s*:\\s*${type})?(?:\\s*\\[${multiplicity}\\])?$`)
const parameterPattern = new RegExp(`^${identifier}\\s*:\\s*${type}$`)
const methodPattern = new RegExp(`^[+\\-#~]?\\s*${identifier}\\s*\\((.*)\\)\\s*(?::\\s*${type})?$`)

const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)

export type UmlAttributeInput = { name: string; type: string; multiplicity: string }
export type UmlMethodInput = { name: string; parameters: string; returnType: string }

export const parseUmlAttribute = (line: string): UmlAttributeInput => {
  const match = line.trim().match(/^([+\-#~]?)\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([^\[]+?))?(?:\s*\[([^\]]+)\])?$/)
  return { name: match?.[2] ?? line.trim(), type: match?.[3]?.trim() ?? '', multiplicity: match?.[4]?.trim() ?? '' }
}

export const formatUmlAttribute = ({ name, type, multiplicity }: UmlAttributeInput) => `${name.trim()}${type.trim() ? `: ${type.trim()}` : ''}${multiplicity.trim() ? ` [${multiplicity.trim()}]` : ''}`

export const parseUmlMethod = (line: string): UmlMethodInput => {
  const match = line.trim().match(/^([+\-#~]?)\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*(?::\s*(.+))?$/)
  return { name: match?.[2] ?? line.trim(), parameters: match?.[3]?.trim() ?? '', returnType: match?.[4]?.trim() ?? '' }
}

export const formatUmlMethod = ({ name, parameters, returnType }: UmlMethodInput) => `${name.trim()}(${parameters.trim()})${returnType.trim() ? `: ${returnType.trim()}` : ''}`

export const validateUmlAttributes = (value: string) => lines(value).flatMap((line, index) => attributePattern.test(line) ? [] : [`Atributo ${index + 1}: usa nombre, tipo opcional y multiplicidad opcional.`])

export const validateUmlMethods = (value: string) => lines(value).flatMap((line, index) => {
  const match = line.match(methodPattern)
  if (!match) return [`Método ${index + 1}: usa nombre(parámetro: Tipo): Retorno.`]
  return match[1].trim() && match[1].split(',').some((parameter) => !parameterPattern.test(parameter.trim()))
    ? [`Método ${index + 1}: cada parámetro debe ser nombre: Tipo.`]
    : []
})

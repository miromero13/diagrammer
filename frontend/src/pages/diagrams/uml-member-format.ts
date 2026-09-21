const identifier = '[A-Za-z_$][\\w$]*'
const type = `${identifier}(?:<${identifier}>)?(?:\\[\\])?`
const multiplicity = '(?:\\d+|\\d+\\.\\.(?:\\d+|\\*))'
const modifiers = '(?:\\s*\\{\\s*(?:static|abstract)(?:\\s*,\\s*(?:static|abstract))?\\s*\\})?'

const attributePattern = new RegExp(`^[+\\-#~]?\\s*\\/?${identifier}(?:\\s*:\\s*${type})?(?:\\s*\\[${multiplicity}\\])?(?:\\s*=\\s*[^\\n{}]+?)?${modifiers}$`, 'i')
const parameterPattern = new RegExp(`^${identifier}\\s*:\\s*${type}$`)
const methodPattern = new RegExp(`^[+\\-#~]?\\s*\\/?${identifier}\\s*\\((.*)\\)\\s*(?::\\s*${type})?${modifiers}$`, 'i')

const lines = (value: string) => value.split('\n').map((line) => line.trim()).filter(Boolean)

export type UmlVisibility = '' | '+' | '-' | '#' | '~'
export type UmlMemberInput = {
  visibility?: UmlVisibility
  name: string
  isStatic?: boolean
  isAbstract?: boolean
  isDerived?: boolean
  defaultValue?: string
}
export type UmlAttributeInput = UmlMemberInput & { type: string; multiplicity: string }
export type UmlMethodInput = UmlMemberInput & { parameters: string; returnType: string }

const parseModifiers = (value: string) => {
  const modifiers = value.match(/\{([^}]+)\}/)?.[1].split(',').map((item) => item.trim().toLowerCase()) ?? []
  return {
    isStatic: modifiers.includes('static'),
    isAbstract: modifiers.includes('abstract'),
  }
}

const withoutModifiers = (value: string) => value.replace(/\s*\{[^}]+\}\s*$/, '').trim()

export const parseUmlAttribute = (line: string): UmlAttributeInput => {
  const source = line.trim(), modifiers = parseModifiers(source), clean = withoutModifiers(source)
  const match = clean.match(/^([+\-#~]?)\s*(\/)?([A-Za-z_$][\w$]*)(?:\s*:\s*([^\[=]+?))?(?:\s*\[([^\]]+)\])?(?:\s*=\s*(.*))?$/)
  return {
    visibility: (match?.[1] ?? '') as UmlVisibility,
    name: match?.[3] ?? line.trim(),
    type: match?.[4]?.trim() ?? '',
    multiplicity: match?.[5]?.trim() ?? '',
    isStatic: modifiers.isStatic,
    isAbstract: modifiers.isAbstract,
    isDerived: Boolean(match?.[2]),
    defaultValue: match?.[6]?.trim() ?? '',
  }
}

export const formatUmlAttribute = ({ visibility, name, type, multiplicity }: UmlAttributeInput) => `${visibility ?? ''}${name.trim()}${type.trim() ? `: ${type.trim()}` : ''}${multiplicity.trim() ? ` [${multiplicity.trim()}]` : ''}`

export const formatUmlAttributeLabel = (input: UmlAttributeInput) => {
  const modifiers = [input.isStatic && 'static', input.isAbstract && 'abstract'].filter(Boolean).join(', ')
  return `${input.visibility ?? ''}${input.isDerived ? '/' : ''}${input.name.trim()}${input.type.trim() ? `: ${input.type.trim()}` : ''}${input.multiplicity.trim() ? ` [${input.multiplicity.trim()}]` : ''}${input.defaultValue?.trim() ? ` = ${input.defaultValue.trim()}` : ''}${modifiers ? ` {${modifiers}}` : ''}`
}

export const parseUmlMethod = (line: string): UmlMethodInput => {
  const source = line.trim(), modifiers = parseModifiers(source), clean = withoutModifiers(source)
  const match = clean.match(/^([+\-#~]?)\s*(\/)?([A-Za-z_$][\w$]*)\s*\((.*)\)\s*(?::\s*(.+))?$/)
  return {
    visibility: (match?.[1] ?? '') as UmlVisibility,
    name: match?.[3] ?? line.trim(),
    parameters: match?.[4]?.trim() ?? '',
    returnType: match?.[5]?.trim() ?? '',
    isStatic: modifiers.isStatic,
    isAbstract: modifiers.isAbstract,
    isDerived: Boolean(match?.[2]),
    defaultValue: '',
  }
}

export const formatUmlMethod = ({ visibility, name, parameters, returnType }: UmlMethodInput) => `${visibility ?? ''}${name.trim()}(${parameters.trim()})${returnType.trim() ? `: ${returnType.trim()}` : ''}`

export const formatUmlMethodLabel = (input: UmlMethodInput) => {
  const modifiers = [input.isStatic && 'static', input.isAbstract && 'abstract'].filter(Boolean).join(', ')
  return `${input.visibility ?? ''}${input.isDerived ? '/' : ''}${input.name.trim()}(${input.parameters.trim()})${input.returnType.trim() ? `: ${input.returnType.trim()}` : ''}${modifiers ? ` {${modifiers}}` : ''}`
}

export const validateUmlAttributes = (value: string) => lines(value).flatMap((line, index) => attributePattern.test(line) ? [] : [`Atributo ${index + 1}: usa nombre, tipo opcional y multiplicidad opcional.`])

export const validateUmlMethods = (value: string) => lines(value).flatMap((line, index) => {
  const match = line.match(methodPattern)
  if (!match) return [`Método ${index + 1}: usa nombre(parámetro: Tipo): Retorno.`]
  return match[1].trim() && match[1].split(',').some((parameter) => !parameterPattern.test(parameter.trim()))
    ? [`Método ${index + 1}: cada parámetro debe ser nombre: Tipo.`]
    : []
})

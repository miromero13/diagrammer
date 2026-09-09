import { api } from '@/lib/api'

import { projectHelper } from './projectHelper'

type GraphLike = Parameters<typeof projectHelper.ensureProjectAndDiagram>[0]

type CodeLanguage = 'java' | 'python' | 'php' | 'spring-boot'

const typeMap = {
  java: { String: 'String', int: 'int', float: 'float', double: 'double', boolean: 'boolean', void: 'void', List: 'List', Map: 'Map' },
  python: { String: 'str', int: 'int', float: 'float', double: 'float', boolean: 'bool', void: 'None', List: 'list', Map: 'dict' },
  php: { String: 'string', int: 'int', float: 'float', double: 'float', boolean: 'bool', void: 'void', List: 'array', Map: 'array' },
} as const

const parseVisibility = (symbol: string | undefined, language: Exclude<CodeLanguage, 'spring-boot'>) => {
  const map = {
    java: { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' },
    python: { '+': '', '-': '__', '#': '_', '~': '' },
    php: { '+': 'public', '-': 'private', '#': 'protected', '~': 'public' },
  } as const

  return map[language][symbol as keyof (typeof map)[typeof language]] || ''
}

const parseMethod = (methodStr: string) => {
  const match = methodStr.match(/^([+\-#~])?(\w+)\((.*)\)(?:\s*:\s*(.+))?$/)
  if (!match) return null

  return {
    visibility: match[1] || '+',
    name: match[2],
    parameters: match[3]
      .split(',')
      .filter((p) => p.trim())
      .map((p) => {
        const [name, type] = p.trim().split(':').map((s) => s.trim())
        return { name, type }
      }),
    returnType: match[4]?.trim() || 'void',
  }
}

const parseAttribute = (attrStr: string) => {
  const match = attrStr.match(/^([+\-#~])?(\w+)(?:\s*:\s*(.+))?$/)
  if (!match) return null

  return {
    visibility: match[1] || '+',
    name: match[2],
    type: match[3]?.trim() || 'String',
  }
}

const camelCase = (str: string) => str.charAt(0).toLowerCase() + str.slice(1)
const snakeCase = (str: string) => str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '')

const generateClass = (
  name: string,
  isInterface: boolean,
  isAbstract: boolean,
  attributes: string[],
  methods: string[],
  language: Exclude<CodeLanguage, 'spring-boot'>,
) => {
  let code = ''

  if (language === 'java') {
    code += isInterface ? `public interface ${name} {\n` : `public ${isAbstract ? 'abstract ' : ''}class ${name} {\n`
    if (!isInterface) {
      attributes.forEach((attr) => {
        const parsed = parseAttribute(attr)
        if (!parsed) return
        code += `    ${parseVisibility(parsed.visibility, 'java')} ${typeMap.java[parsed.type as keyof typeof typeMap.java] || parsed.type} ${parsed.name};\n`
      })
    }
    methods.forEach((method) => {
      const parsed = parseMethod(method)
      if (!parsed) return
      const returnType = typeMap.java[parsed.returnType as keyof typeof typeMap.java] || parsed.returnType
      const params = parsed.parameters.map((p) => `${typeMap.java[p.type as keyof typeof typeMap.java] || p.type} ${p.name}`).join(', ')
      code += `    ${parseVisibility(parsed.visibility, 'java')} ${returnType} ${parsed.name}(${params})${isInterface || isAbstract ? ';' : ' {\n        // TODO: Implement method\n    }'}\n`
    })
    code += '}'
    return code
  }

  if (language === 'python') {
    code += `class ${name}:\n`
    if (!isInterface && !isAbstract) {
      code += '    def __init__(self):\n        pass\n'
    }
    methods.forEach((method) => {
      const parsed = parseMethod(method)
      if (!parsed) return
      const params = parsed.parameters.map((p) => `${p.name}: ${typeMap.python[p.type as keyof typeof typeMap.python] || p.type}`).join(', ')
      code += `    def ${snakeCase(parsed.name)}(self${params ? `, ${params}` : ''}) -> ${typeMap.python[parsed.returnType as keyof typeof typeMap.python] || parsed.returnType}:\n        pass\n`
    })
    return code
  }

  code += `${isInterface ? 'interface' : `${isAbstract ? 'abstract ' : ''}class`} ${name} {\n`
  attributes.forEach((attr) => {
    const parsed = parseAttribute(attr)
    if (!parsed) return
    code += `    ${parseVisibility(parsed.visibility, 'php')} ${typeMap.php[parsed.type as keyof typeof typeMap.php] || parsed.type} $${parsed.name};\n`
  })
  methods.forEach((method) => {
    const parsed = parseMethod(method)
    if (!parsed) return
    const params = parsed.parameters.map((p) => `${typeMap.php[p.type as keyof typeof typeMap.php] || p.type} $${p.name}`).join(', ')
    const returnType = typeMap.php[parsed.returnType as keyof typeof typeMap.php] || parsed.returnType
    code += `    ${parseVisibility(parsed.visibility, 'php')} function ${parsed.name}(${params}): ${returnType} {\n        // TODO: Implement method\n    }\n`
  })
  code += '}'
  return code
}

const generateHeader = (language: Exclude<CodeLanguage, 'spring-boot'>) => {
  if (language === 'java') return 'import java.util.*;\n\n'
  if (language === 'python') return 'from typing import List, Dict, Optional\n\n'
  if (language === 'php') return '<?php\n\n'
  return ''
}

export const codeGenerator = {
  parseVisibility,
  parseMethod,
  parseAttribute,
  camelCase,
  snakeCase,

  generateCode(graph: GraphLike, language: CodeLanguage) {
    if (language === 'spring-boot') {
      return this.generateSpringBootProject(graph)
    }

    const elements = graph.getElements()
    let code = generateHeader(language)

    elements.forEach((element) => {
      const name = String(element.get('name') || 'Class').replace(/<<interface>>\n|<<abstract>>\n/, '')
      const isInterface = String(element.get('name') || '').includes('<<interface>>')
      const isAbstract = String(element.get('name') || '').includes('<<abstract>>')
      code += generateClass(name, isInterface, isAbstract, (element.get('attributes') || []) as string[], (element.get('methods') || []) as string[], language)
      code += '\n\n'
    })

    return code
  },

  async generateSpringBootProject(graph: GraphLike, options: { projectName?: string; packageName?: string } = {}) {
    const { projectId, diagramId } = await projectHelper.ensureProjectAndDiagram(graph)
    const response = await api.post<{ success: boolean; downloadUrl: string; message: string }>(`/code-generation/diagrams/${diagramId}/generate`, {
      language: 'spring-boot',
      projectName: options.projectName || 'generated-project',
      packageName: options.packageName || 'com.example.generated',
    })

    return { ...response, projectId, diagramId }
  },

  async downloadGeneratedCode(downloadUrl: string) {
    window.location.href = downloadUrl
  },
}

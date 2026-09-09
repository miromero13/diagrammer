const calculateWidth = (texts: string[]) => {
  const textLengths = texts.map((text) => text.length * 8)
  return Math.max(...textLengths, 150)
}

const calculateHeight = (attrs: string[], methods: string[], kind?: 'interface' | 'abstract') => {
  const totalItems = kind === 'interface' ? methods.length : attrs.length + methods.length
  return 40 + totalItems * 20
}

const buildUmlShape = (position: { x: number, y: number }, options: {
  name: string
  attributes: string[]
  methods: string[]
  kind?: 'interface' | 'abstract'
}) => {
  const joint = (window as any).joint
  const width = calculateWidth([options.name, ...options.attributes, ...options.methods])
  const height = calculateHeight(options.attributes, options.methods, options.kind)

  const shape = new joint.shapes.uml.Class({
    position,
    size: { width, height },
    name: options.kind === 'interface' ? `<<interface>>\n${options.name}` : options.kind === 'abstract' ? `<<abstract>>\n${options.name}` : options.name,
    attributes: options.kind === 'interface' ? [] : options.attributes,
    methods: options.methods,
    attrs: options.kind === 'interface'
      ? {
          '.uml-class-name-rect': {
            fill: '#818cf8',
            stroke: '#4f46e5',
            'stroke-width': 2,
            'stroke-dasharray': '0'
          },
          '.uml-class-attrs-rect': {
            display: 'none'
          },
          '.uml-class-methods-rect': {
            fill: '#eef2ff',
            stroke: '#4f46e5',
            'stroke-width': 2
          },
          '.uml-class-name-text': {
            'font-family': 'JetBrains Mono',
            'font-size': 12,
            'font-weight': 600,
            fill: '#ffffff',
            'ref-x': 0.5,
            'ref-y': 0.5,
            'y-alignment': 'middle',
            'x-alignment': 'middle'
          },
          '.uml-class-methods-text': {
            'font-family': 'JetBrains Mono',
            'font-size': 11,
            fill: '#312e81',
            'ref-x': 5,
            'ref-y': 5
          }
        }
      : {
          '.uml-class-name-rect': {
            fill: '#ffffff',
            stroke: '#6366f1',
            'stroke-width': 2
          },
          '.uml-class-attrs-rect': {
            fill: '#ffffff',
            stroke: '#6366f1',
            'stroke-width': 2
          },
          '.uml-class-methods-rect': {
            fill: '#ffffff',
            stroke: '#6366f1',
            'stroke-width': 2
          },
          '.uml-class-name-text': {
            'font-family': 'JetBrains Mono',
            'font-size': 12,
            'font-weight': 500,
            fill: '#1e293b',
            'ref-x': 0.5,
            'ref-y': 0.5,
            'y-alignment': 'middle',
            'x-alignment': 'middle'
          },
          '.uml-class-attrs-text': {
            'font-family': 'JetBrains Mono',
            'font-size': 11,
            fill: '#475569',
            'ref-x': 5,
            'ref-y': 5
          },
          '.uml-class-methods-text': {
            'font-family': 'JetBrains Mono',
            'font-size': 11,
            fill: '#475569',
            'ref-x': 5,
            'ref-y': 5
          }
        }
  })

  shape.set('umlType', options.kind === 'interface' ? 'uml.Interface' : options.kind === 'abstract' ? 'uml.AbstractClass' : 'uml.Class')
  shape.set('name', options.kind === 'interface' ? `<<interface>>\n${options.name}` : options.kind === 'abstract' ? `<<abstract>>\n${options.name}` : options.name)
  shape.set('attributes', options.kind === 'interface' ? [] : options.attributes)
  shape.set('methods', options.methods)

  return shape
}

export const UMLShapes = {
  createClass(position: { x: number, y: number }, name = 'Class', attributes: string[] = ['+attribute1: type', '-attribute2: type'], methods: string[] = ['+method1(): returnType', '-method2(param: type): returnType']) {
    return buildUmlShape(position, { name, attributes, methods })
  },

  createInterface(position: { x: number, y: number }, name = 'Interface', methods: string[] = ['+method1(): returnType', '+method2(param: type): returnType']) {
    return buildUmlShape(position, { name, attributes: [], methods, kind: 'interface' })
  },

  createAbstractClass(position: { x: number, y: number }, name = 'Abstract', attributes: string[] = ['+attribute1: type', '-attribute2: type'], methods: string[] = ['+method1(): returnType', '-method2(param: type): returnType']) {
    return buildUmlShape(position, { name, attributes, methods, kind: 'abstract' })
  }
}

export const buildUmlLabel = (name: string, attributes: string[], methods: string[], kind?: 'interface' | 'abstract') => {
  const prefix = kind === 'interface' ? '<<interface>>\n' : kind === 'abstract' ? '<<abstract>>\n' : ''
  const sections = [prefix + name, ...attributes, ...methods].filter(Boolean)
  return sections.join('\n')
}

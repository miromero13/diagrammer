const createLink = (props: Record<string, unknown>, source: any, target: any) => {
  const link = new (window as any).joint.dia.Link({
    ...props,
    smooth: { type: 'manhattan' },
    connector: { name: 'rounded' },
  })

  link.source({ id: source.id })
  link.target({ id: target.id })
  return link
}

export const Relationships = {
  createAssociation(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#6b7280', 'stroke-width': 2 },
        '.marker-target': { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#6b7280', stroke: '#6b7280' },
        '.marker-source': { display: 'none' },
      },
    }, source, target)
  },

  createNavigableAssociation(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#0f766e', 'stroke-width': 2 },
        '.marker-target': { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#0f766e', stroke: '#0f766e' },
        '.marker-source': { d: 'M 10 0 L 0 5 L 10 10 z', fill: '#0f766e', stroke: '#0f766e' },
      },
    }, source, target)
  },

  createInheritance(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#111827', 'stroke-width': 2 },
        '.marker-target': { d: 'M 20 0 L 0 10 L 20 20 z', fill: '#ffffff', stroke: '#111827', 'stroke-width': 2 },
        '.marker-source': { display: 'none' },
      },
    }, source, target)
  },

  createImplementation(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#111827', 'stroke-width': 2, 'stroke-dasharray': '5,3' },
        '.marker-target': { d: 'M 20 0 L 0 10 L 20 20 z', fill: '#ffffff', stroke: '#111827', 'stroke-width': 2 },
        '.marker-source': { display: 'none' },
      },
    }, source, target)
  },

  createComposition(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#4f46e5', 'stroke-width': 2 },
        '.marker-target': { d: 'M 20 10 L 10 0 L 0 10 L 10 20 z', fill: '#4f46e5', stroke: '#4f46e5' },
        '.marker-source': { display: 'none' },
      },
    }, source, target)
  },

  createAggregation(source: any, target: any) {
    return createLink({
      attrs: {
        '.connection': { stroke: '#4f46e5', 'stroke-width': 2 },
        '.marker-target': { d: 'M 20 10 L 10 0 L 0 10 L 10 20 z', fill: '#ffffff', stroke: '#4f46e5', 'stroke-width': 2 },
        '.marker-source': { display: 'none' },
      },
    }, source, target)
  },
}

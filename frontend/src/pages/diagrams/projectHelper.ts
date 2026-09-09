import { projectsService } from '@/pages/projects/services/projects.service'
import { diagramsService } from './services/diagrams.service'

type GraphLike = {
  getElements: () => Array<{ id: string; get: (key: string) => unknown }>
  getLinks: () => Array<{ id: string; get: (key: string) => unknown; getSourceElement: () => { id: string } | undefined; getTargetElement: () => { id: string } | undefined; labels: () => Array<any> }>
}

export const projectHelper = {
  async ensureProjectAndDiagram(graph: GraphLike) {
    const currentProjectId = window.localStorage.getItem('currentProjectId')
    let projectId = currentProjectId
    let diagramId = window.localStorage.getItem('currentDiagramId')

    if (!projectId) {
      const result = await projectsService.createProject({
        name: 'Proyecto UML',
        description: 'Proyecto creado automáticamente para generación de código',
        visibility: 'private',
      })
      projectId = (result as any)?.data?.id ?? (result as any)?.id
      if (!projectId) throw new Error('Error al crear proyecto')
      window.localStorage.setItem('currentProjectId', projectId)
    }

    const diagramData = this.extractDiagramData(graph)

    if (!diagramId) {
      const result = await diagramsService.createDiagram(projectId, {
        name: 'Diagrama UML',
        description: 'Diagrama creado automáticamente para generación de código',
        content: diagramData,
      })
      diagramId = (result as any)?.data?.id ?? (result as any)?.id
      if (!diagramId) throw new Error('Error al crear diagrama')
      window.localStorage.setItem('currentDiagramId', diagramId)
    } else {
      await diagramsService.updateDiagram(diagramId, {
        content: diagramData,
      })
    }

    return { projectId, diagramId }
  },

  extractDiagramData(graph: GraphLike) {
    return {
      elements: graph.getElements().map((element) => ({
        id: element.id,
        type: String(element.get('type') || ''),
        name: String(element.get('name') || ''),
        attributes: (element.get('attributes') || []) as string[],
        methods: (element.get('methods') || []) as string[],
        position: element.get('position') as { x: number; y: number } | undefined,
        size: element.get('size') as { width: number; height: number } | undefined,
      })),
      connections: graph.getLinks().map((link) => ({
        id: link.id,
        type: String(link.get('relationType') ?? link.get('type') ?? ''),
        sourceId: link.getSourceElement()?.id,
        targetId: link.getTargetElement()?.id,
        sourceMultiplicity: link.labels()?.[0]?.attrs?.text?.text ?? '1',
        targetMultiplicity: link.labels()?.[1]?.attrs?.text?.text ?? '1',
      })),
      metadata: {
        version: '1.0',
        lastModified: new Date().toISOString(),
        elementsCount: graph.getElements().length,
        linksCount: graph.getLinks().length,
      },
    }
  },
}

import { api } from '@/lib/api'

import type { CreateDiagramInput, DiagramDetailsResponse, UpdateDiagramInput } from '../models/diagram.model'

export const diagramsService = {
  createDiagram: async (projectId: string, payload: CreateDiagramInput) => {
    return api.post(`/projects/${projectId}/diagrams`, payload)
  },
  getDiagram: async (diagramId: string) => {
    return api.get<DiagramDetailsResponse>(`/diagrams/${diagramId}`)
  },
  updateDiagram: async (diagramId: string, payload: UpdateDiagramInput) => {
    return api.put(`/diagrams/${diagramId}`, payload)
  },
  quickUpdateDiagram: async (diagramId: string, content: UpdateDiagramInput['content']) => {
    return api.patch(`/diagrams/${diagramId}/quick-update`, { content })
  },
}

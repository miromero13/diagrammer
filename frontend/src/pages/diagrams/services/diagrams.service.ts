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
  startGeneration: async (diagramId: string, payload: { companyName: string; backendName: string; authentication: Record<string, unknown> }) =>
    api.post<{ generationId: string }>(`/code-generation/diagrams/${diagramId}/generate`, payload),
  getGenerationStatus: async (generationId: string) =>
    api.get<{ generatedCode: { status: string; steps: Array<{ id: string; label: string; status: string }>; message?: string; compilationErrors?: string | null } }>(`/code-generation/${generationId}/status`),
  downloadGeneration: (generationId: string) => api.getBlob(`/code-generation/${generationId}/download`),
}

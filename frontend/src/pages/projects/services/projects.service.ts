import { api } from '@/lib/api'

import { normalizeProjectsResponse } from '../adapters/projects.adapter'
import type { CreateProjectInput, ProjectDetailsResponse, ProjectDiagramsResponse, ProjectsResponse } from '../models/project.model'

export const projectsService = {
  getProjects: async (page = 1, limit = 12) => {
    const response = await api.get<ProjectsResponse>(`/projects?page=${page}&limit=${limit}`)
    return normalizeProjectsResponse(response)
  },
  createProject: async (payload: CreateProjectInput) => {
    return api.post('/projects', payload)
  },
  getProject: async (id: string) => {
    return api.get<ProjectDetailsResponse>(`/projects/${id}`)
  },
  getProjectDiagrams: async (projectId: string) => {
    return api.get<ProjectDiagramsResponse>(`/projects/${projectId}/diagrams`)
  },
}

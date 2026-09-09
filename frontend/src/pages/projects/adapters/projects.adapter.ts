import type { Project, ProjectsResponse } from '../models/project.model'

export const normalizeProject = (project: Project): Project => ({
  ...project,
  description: project.description ?? null,
})

export const normalizeProjectsResponse = (response: ProjectsResponse): ProjectsResponse => ({
  ...response,
  projects: response.projects.map(normalizeProject),
})

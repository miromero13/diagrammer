export type ProjectVisibility = 'private' | 'public'

export interface ProjectOwner {
  id: string
  username: string
  email: string
  firstName: string
  lastName: string
  avatarUrl?: string | null
}

export interface ProjectMemberUser extends ProjectOwner {}

export interface ProjectMember {
  id: string
  role: string
  user: ProjectMemberUser
}

export interface Project {
  id: string
  name: string
  description?: string | null
  isPublic: boolean
  updatedAt: string
  createdAt: string
  owner?: ProjectOwner
  diagrams?: Array<{ id: string; name: string }>
  projectMembers?: ProjectMember[]
}

export interface ProjectPagination {
  page: number
  limit: number
  total: number
  pages: number
}

export interface ProjectsResponse {
  projects: Project[]
  pagination: ProjectPagination
}

export interface ProjectDetailsResponse {
  project: Project
  userRole: string
}

export interface ProjectDiagram {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  updatedAt: string
  createdAt: string
}

export interface ProjectDiagramsResponse {
  diagrams: ProjectDiagram[]
  pagination: ProjectPagination
}

export interface CreateProjectInput {
  name: string
  description?: string
  visibility?: ProjectVisibility
  settings?: Record<string, unknown>
}

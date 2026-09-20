export type UmlVisibility = '' | '+' | '-' | '#' | '~'

export interface UmlMemberSemantics {
  visibility?: UmlVisibility
  isStatic?: boolean
  isAbstract?: boolean
  isDerived?: boolean
  defaultValue?: string
}

export interface UmlWayPoint {
  x: number
  y: number
}

export interface DiagramContent {
  elements?: Array<{
    id?: string
    type?: string
    name?: string
    attributes?: string[]
    methods?: string[]
    attributeSemantics?: UmlMemberSemantics[]
    methodSemantics?: UmlMemberSemantics[]
    isAbstract?: boolean
    literals?: string[]
    position?: { x: number; y: number }
    size?: { width: number; height: number }
  }>
  connections?: Array<{
    id?: string
    type?: string
    sourceId?: string
    targetId?: string
    source?: string | { id?: string }
    target?: string | { id?: string }
    associationClassId?: string
    associationClassLink?: boolean
    sourceMultiplicity?: string
    targetMultiplicity?: string
    sourceRoleName?: string
    targetRoleName?: string
    sourceNavigable?: boolean
    targetNavigable?: boolean
    stereotype?: string
    usage?: string
    waypoints?: UmlWayPoint[]
  }>
  metadata?: Record<string, unknown>
}

export interface DiagramDetailsResponse {
  id: string
  name: string
  description?: string | null
  isActive: boolean
  updatedAt: string
  createdAt: string
  projectId: string
  content: DiagramContent
}

export interface CreateDiagramInput {
  name: string
  description?: string
  content?: Record<string, unknown>
}

export interface UpdateDiagramInput {
  name?: string
  description?: string
  content?: DiagramContent | string
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider, reconnectEdge, useEdgesState, useNodesState, useReactFlow, type Connection, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { ArrowLeft, Bot, CircleAlert, PanelLeftIcon } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { AppConfig } from '@/config/app.config'
import { useTheme } from '@/hooks/useTheme'

import { DiagramExportDropdown } from './components/diagram-export-dropdown'
import { SpringbootGeneration } from './components/springboot-generation'
import { DiagramChatSidebar } from './components/diagram-chat-sidebar'
import { DiagramCanvasSurface } from './components/diagram-canvas'
import { DiagramCollaboratorsTooltip } from './components/diagram-collaborators-tooltip'
import { DiagramEditorDialog } from './components/diagram-editor-dialog'
import { DiagramElementsSidebar } from './components/diagram-elements-sidebar'
import { DiagramImportDropdown } from './components/diagram-import-dropdown'
import { DiagramKeyboardShortcutsMenu } from './components/diagram-keyboard-shortcuts-menu'
import { diagramsService } from './services/diagrams.service'
import { diagramsAiService, type DiagramChatMessage, type DiagramChatConversationTurn } from './services/ai.service'
import type { DiagramContent, DiagramDetailsResponse } from './models/diagram.model'
import { materializeManyToMany } from './many-to-many'
import { socketManager } from './socketManager'

type Tool = 'select' | 'class' | 'interface' | 'abstract' | 'enum' | 'association' | 'dependency' | 'enumUsage' | 'inheritance' | 'implementation' | 'composition' | 'aggregation'
type UmlKind = 'class' | 'interface' | 'abstract' | 'enum'
type UmlRelation = Exclude<Tool, 'select' | 'class' | 'interface' | 'abstract' | 'enum'>
type MultiplicityMode = 'both' | 'target-only' | 'none'
type UmlRelationConfig = {
  hasMultiplicity: boolean
  sourceFixed?: string
}

interface DiagramNodeData extends Record<string, unknown> {
  name: string
  kind: UmlKind
  attributes: string[]
  methods: string[]
  literals: string[]
  onEdit?: (id: string) => void
  themeMode?: 'light' | 'dark'
  remoteSelectedColor?: string
  remoteSelectedLabel?: string
  remoteMovingColor?: string
}

interface DiagramEdgeData extends Record<string, unknown> {
  relationType: UmlRelation
  sourceMultiplicity: string
  targetMultiplicity: string
  onEdit?: (id: string) => void
  themeMode?: 'light' | 'dark'
  remoteSelectedColor?: string
  remoteSelectedLabel?: string
  remoteMovingColor?: string
  remoteMovingLabel?: string
  associationClassId?: string
  associationClassLink?: boolean
  associationClassPosition?: { x: number; y: number; width?: number }
}

type CollaborationUser = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
}

type RemoteMotionState = {
  color: string
  label: string
}

type CollaborationLock = {
  userId: string
  diagramId: string
  timestamp: number
}

type CollaborationSelection = {
  userId: string
  diagramId: string
  timestamp: number
}

type DiagramSnapshot = {
  nodes: Array<Node<DiagramNodeData>>
  edges: Array<Edge<DiagramEdgeData>>
  selectedNodeId: string | null
  selectedEdgeId: string | null
}

type DiagramClipboardItem =
  | { type: 'node'; node: Node<DiagramNodeData> }
  | { type: 'edge'; edge: Edge<DiagramEdgeData> }

type CollaborationElementPayload = {
  id?: string
  type?: string
  name?: string
  attributes?: string[]
  methods?: string[]
  literals?: string[]
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  sourceId?: string
  targetId?: string
  source?: string | { id?: string }
  target?: string | { id?: string }
  sourceMultiplicity?: string
  targetMultiplicity?: string
}

type SidebarMode = 'elements' | 'chat'

type ChatAttachment = {
  id: string
  file: File
  name: string
  mimeType: string
  kind: 'image' | 'document'
  previewUrl?: string | null
}

type VoiceRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: any) => void) | null
  onend: (() => void) | null
  onerror: ((event: any) => void) | null
}

const getPayloadElementId = (payload?: any): string | null => {
  const value = payload?.elementId ?? payload?.id ?? payload?.element?.id ?? payload?.selectedElementId ?? payload?.selectedId
  return value ? String(value) : null
}

const NODE_WIDTH = 260

const createId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

const getNodeCursorAnchor = (node: Node<DiagramNodeData>) => ({
  x: node.position.x + NODE_WIDTH + 20,
  y: node.position.y + 18,
})

const getEdgeCursorAnchor = (edge: Edge<DiagramEdgeData>, diagramNodes: Array<Node<DiagramNodeData>>) => {
  const source = diagramNodes.find((node) => node.id === edge.source)
  const target = diagramNodes.find((node) => node.id === edge.target)
  if (!source || !target) return null

  return {
    x: (source.position.x + NODE_WIDTH / 2 + target.position.x + NODE_WIDTH / 2) / 2,
    y: (source.position.y + getNodeHeight(source) / 2 + target.position.y + getNodeHeight(target) / 2) / 2,
  }
}

const collaboratorColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899']

const getCollaboratorColor = (value: string) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return collaboratorColors[hash % collaboratorColors.length]
}

const getCollaboratorLabel = (user?: CollaborationUser | null) => {
  if (!user) return 'Otro usuario'
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.id
}

const cloneDiagramNode = (node: Node<DiagramNodeData>): Node<DiagramNodeData> => ({
  ...node,
  data: {
    ...node.data,
    attributes: [...node.data.attributes],
    methods: [...node.data.methods],
    literals: [...node.data.literals],
  },
})

const cloneDiagramEdge = (edge: Edge<DiagramEdgeData>): Edge<DiagramEdgeData> => ({
  ...edge,
  data: edge.data ? { ...edge.data } : edge.data,
})

const offsetPoint = (position: { x: number; y: number }, offset = 24) => ({
  x: position.x + offset,
  y: position.y + offset,
})

const getNodeHeight = (node: Pick<Node<DiagramNodeData>, 'data'>) => 120 + Math.max(node.data.attributes.length, node.data.methods.length, node.data.literals.length) * 20

const normalizeRelationType = (relationType?: string | null): UmlRelation => {
  if (relationType === 'navigable') return 'dependency'
  if (relationType === 'dependency') return 'dependency'
  if (relationType === 'enumUsage') return 'enumUsage'
  if (relationType === 'inheritance') return 'inheritance'
  if (relationType === 'implementation') return 'implementation'
  if (relationType === 'composition') return 'composition'
  if (relationType === 'aggregation') return 'aggregation'
  return 'association'
}

const UML_RELATION_CONFIG: Record<UmlRelation, UmlRelationConfig> = {
  association: { hasMultiplicity: true },
  aggregation: { hasMultiplicity: true },
  composition: { hasMultiplicity: true, sourceFixed: '1' },
  inheritance: { hasMultiplicity: false },
  implementation: { hasMultiplicity: false },
  dependency: { hasMultiplicity: false },
  enumUsage: { hasMultiplicity: false },
}

const relationMultiplicityMode = (relationType: UmlRelation): MultiplicityMode => {
  const config = UML_RELATION_CONFIG[relationType]
  if (!config.hasMultiplicity) return 'none'
  return config.sourceFixed ? 'target-only' : 'both'
}

const getRelationSourceMultiplicity = (relationType: UmlRelation, value?: string | null) => {
  const config = UML_RELATION_CONFIG[relationType]
  return config.sourceFixed ?? value?.trim() ?? '1'
}

const getRelationTargetMultiplicity = (relationType: UmlRelation, value?: string | null) => {
  if (!UML_RELATION_CONFIG[relationType].hasMultiplicity) return ''
  return value?.trim() || '1'
}

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

const emptyContent = (): DiagramContent => ({ elements: [], connections: [], metadata: {} })

const kindToType = (kind: UmlKind) => (kind === 'interface' ? 'uml.Interface' : kind === 'abstract' ? 'uml.AbstractClass' : kind === 'enum' ? 'uml.Enumeration' : 'uml.Class')

const typeToKind = (type?: string, name?: string): UmlKind => {
  if (String(type) === 'uml.Interface' || String(name ?? '').includes('<<interface>>')) return 'interface'
  if (String(type) === 'uml.AbstractClass' || String(name ?? '').includes('<<abstract>>')) return 'abstract'
  if (String(type) === 'uml.Enumeration' || String(name ?? '').includes('<<enumeration>>')) return 'enum'
  return 'class'
}

const prefixName = (kind: UmlKind, name: string) => {
  if (kind === 'interface') return `<<interface>>\n${name}`
  if (kind === 'abstract') return `<<abstract>>\n${name}`
  if (kind === 'enum') return `<<enumeration>>\n${name}`
  return name
}

const stripPrefix = (name: string) => name.replace(/^<<(?:interface|abstract|enumeration)>>\n/, '')

const isEnumElement = (element?: { type?: string; name?: string } | null) => typeToKind(element?.type, element?.name) === 'enum'

const normalizeEnumUsageEndpoints = <T extends { source: string; target: string }>(
  relationType: UmlRelation,
  relation: T,
  elementsById: Map<string, { type?: string; name?: string }>
) => {
  if (relationType !== 'enumUsage') return relation
  const sourceIsEnum = isEnumElement(elementsById.get(relation.source))
  const targetIsEnum = isEnumElement(elementsById.get(relation.target))
  return sourceIsEnum && !targetIsEnum ? { ...relation, source: relation.target, target: relation.source } : relation
}

const toNodes = (content?: DiagramContent | null): Array<Node<DiagramNodeData>> => {
  return (content?.elements ?? []).map((element, index) => {
    const kind = typeToKind(element.type, element.name)
    return {
      id: element.id ?? createId(),
      type: 'umlNode',
      position: element.position ?? { x: 80 + (index % 3) * 320, y: 80 + Math.floor(index / 3) * 260 },
      data: {
        name: stripPrefix(element.name ?? 'Class'),
        kind,
        attributes: element.attributes ?? [],
        methods: element.methods ?? [],
        literals: element.literals ?? [],
      },
    }
  })
}

const toEdges = (content?: DiagramContent | null): Array<Edge<DiagramEdgeData>> => {
  const elementsById = new Map((content?.elements ?? []).map((element) => [String(element.id ?? ''), element]))
  return (content?.connections ?? []).map((connection) => {
    const relationType = normalizeRelationType(connection.type)
    const associationClass = connection.associationClassId ? elementsById.get(connection.associationClassId) : undefined
    const associationClassPosition = associationClass?.position
      ? { x: associationClass.position.x, y: associationClass.position.y, width: associationClass.size?.width }
      : undefined
    const endpoints = normalizeEnumUsageEndpoints(relationType, {
      source: String(connection.sourceId ?? (typeof connection.source === 'string' ? connection.source : connection.source?.id ?? '')),
      target: String(connection.targetId ?? (typeof connection.target === 'string' ? connection.target : connection.target?.id ?? '')),
    }, elementsById)
    return {
      id: connection.id ?? createId(),
      source: endpoints.source,
      target: endpoints.target,
      type: 'umlEdge',
      data: {
        relationType,
        sourceMultiplicity: connection.sourceMultiplicity ?? '1',
        targetMultiplicity: connection.targetMultiplicity ?? '1',
        associationClassId: connection.associationClassId,
        associationClassLink: connection.associationClassLink,
        associationClassPosition,
      },
    }
  }).filter((edge) => edge.source && edge.target)
}

const toContent = (nodes: Array<Node<DiagramNodeData>>, edges: Array<Edge<DiagramEdgeData>>): DiagramContent => ({
  elements: nodes.map((node) => ({
    id: node.id,
    type: kindToType(node.data.kind),
    name: prefixName(node.data.kind, node.data.name),
    attributes: node.data.attributes,
    methods: node.data.methods,
    literals: node.data.literals,
    position: node.position,
    size: { width: NODE_WIDTH, height: getNodeHeight(node) },
  })),
  connections: edges.map((edge) => {
    const relationType = normalizeRelationType(edge.data?.relationType)
    const config = UML_RELATION_CONFIG[relationType]
    const endpoints = normalizeEnumUsageEndpoints(relationType, { source: edge.source, target: edge.target }, new Map(nodes.map((node) => [node.id, { type: kindToType(node.data.kind), name: node.data.name }])))
    return {
      id: edge.id,
      type: relationType,
      sourceId: endpoints.source,
      targetId: endpoints.target,
      source: endpoints.source,
      target: endpoints.target,
      associationClassId: edge.data?.associationClassId,
      associationClassLink: edge.data?.associationClassLink,
      sourceMultiplicity: config.hasMultiplicity ? (config.sourceFixed ?? edge.data?.sourceMultiplicity ?? '1') : '',
      targetMultiplicity: config.hasMultiplicity ? (edge.data?.targetMultiplicity ?? '1') : '',
    }
  }),
  metadata: {
    version: 'reactflow',
    lastModified: new Date().toISOString(),
    elementsCount: nodes.length,
    linksCount: edges.length,
  },
})

const serializeNodeForCollaboration = (node: Node<DiagramNodeData>) => ({
  id: node.id,
  type: kindToType(node.data.kind),
  name: prefixName(node.data.kind, node.data.name),
  attributes: node.data.attributes,
  methods: node.data.methods,
  position: node.position,
  size: { width: NODE_WIDTH, height: 120 + Math.max(node.data.attributes.length, node.data.methods.length) * 20 },
})

const serializeEdgeForCollaboration = (edge: Edge<DiagramEdgeData>) => ({
  id: edge.id,
  type: normalizeRelationType(edge.data?.relationType),
  sourceId: edge.source,
  targetId: edge.target,
  source: edge.source,
  target: edge.target,
  sourceMultiplicity: edge.data?.sourceMultiplicity ?? '1',
  targetMultiplicity: edge.data?.targetMultiplicity ?? '1',
})

const DiagramFlow = () => {
  const { projectId, diagramId } = useParams<{ projectId: string, diagramId: string }>()
  const reactFlow = useReactFlow()
  const { theme } = useTheme()
  const themeMode: 'light' | 'dark' = theme === 'dark' ? 'dark' : 'light'
  const minimapProps = themeMode === 'dark'
    ? {
        nodeColor: () => 'hsl(215 16% 28% / 0.85)',
        nodeStrokeColor: () => 'hsl(215 14% 42% / 0.55)',
        maskColor: 'hsl(222 47% 8% / 0.62)',
        maskStrokeColor: 'hsl(215 12% 38% / 0.16)',
      }
    : {}
  const pendingRelationSourceId = useRef<string | null>(null)

  const [diagram, setDiagram] = useState<DiagramDetailsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tool, setTool] = useState<Tool>('select')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorMode, setEditorMode] = useState<'node' | 'edge'>('node')
  const [editorId, setEditorId] = useState<string | null>(null)
  const [editorName, setEditorName] = useState('')
  const [editorAttributes, setEditorAttributes] = useState('')
  const [editorMethods, setEditorMethods] = useState('')
  const [editorLiterals, setEditorLiterals] = useState('')
  const [editorSourceMultiplicity, setEditorSourceMultiplicity] = useState('1')
  const [editorTargetMultiplicity, setEditorTargetMultiplicity] = useState('1')
  const [editorRelationType, setEditorRelationType] = useState<UmlRelation>('association')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [asideOpen, setAsideOpen] = useState(true)
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('elements')
  const [chatMessages, setChatMessages] = useState<DiagramChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatAttachments, setChatAttachments] = useState<ChatAttachment[]>([])
  const [isRecordingVoice, setIsRecordingVoice] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [chatSending, setChatSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<DiagramNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge<DiagramEdgeData>>([])
  const [collaborationUsers, setCollaborationUsers] = useState<CollaborationUser[]>([])
  const [, setCollaborationLocks] = useState<Record<string, CollaborationLock>>({})
  const [collaborationSelections, setCollaborationSelections] = useState<Record<string, CollaborationSelection>>({})
  const [remoteMotionByElement, setRemoteMotionByElement] = useState<Record<string, RemoteMotionState>>({})
  const saveTimerRef = useRef<number | null>(null)
  const loadingRef = useRef(true)
  const nodeSyncThrottleRef = useRef<number | null>(null)
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const chatFileInputRef = useRef<HTMLInputElement | null>(null)
  const voiceRecognitionRef = useRef<VoiceRecognition | null>(null)
  const voiceSeedRef = useRef('')
  const voiceFinalRef = useRef('')
  const voiceInterimRef = useRef('')
  const chatInputRef = useRef('')
  const sendChatMessageRef = useRef<(() => void) | null>(null)
  const pendingSendAfterVoiceStopRef = useRef(false)
  const exportTargetRef = useRef<HTMLDivElement>(null)
  const chatScrollEndRef = useRef<HTMLDivElement | null>(null)
  const historyRef = useRef<{ past: DiagramSnapshot[]; future: DiagramSnapshot[]; diagramId: string | null }>({
    past: [],
    future: [],
    diagramId: null,
  })
  const clipboardRef = useRef<DiagramClipboardItem | null>(null)

  const isRelationTool = (value: Tool) => value === 'association' || value === 'dependency' || value === 'enumUsage' || value === 'inheritance' || value === 'implementation' || value === 'composition' || value === 'aggregation'

  const buildEdge = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return null

    const relationType = isRelationTool(tool) ? tool : 'association'
    const endpoints = normalizeEnumUsageEndpoints(relationType, { source: sourceId, target: targetId }, new Map(nodesRef.current.map((node) => [node.id, { type: kindToType(node.data.kind), name: node.data.name }])))
    const config = UML_RELATION_CONFIG[relationType]

    return {
      id: createId(),
      source: endpoints.source,
      target: endpoints.target,
      type: 'umlEdge',
      data: {
        relationType,
        sourceMultiplicity: config.sourceFixed ?? '1',
        targetMultiplicity: config.hasMultiplicity ? '1' : '',
        onEdit: openEdgeEditor,
      },
    } as Edge<DiagramEdgeData>
  }, [tool])


  const deleteSelection = () => {
    const nodeIdToDelete = selectedNodeId
    const edgeIdToDelete = selectedEdgeId

    if (!nodeIdToDelete && !edgeIdToDelete) return

    pushHistory()

    setNodes((current) => current.filter((node) => node.id !== nodeIdToDelete))
    setEdges((current) => current.filter((edge) => {
      if (edge.id === edgeIdToDelete) return false
      if (nodeIdToDelete && (edge.source === nodeIdToDelete || edge.target === nodeIdToDelete)) return false
      return true
    }))

    if (editorId && (editorId === nodeIdToDelete || editorId === edgeIdToDelete)) {
      if (AppConfig.COLLABORATION_ENABLED) socketManager.unlockElement(editorId)
      setEditorOpen(false)
      setEditorId(null)
    }

    if (AppConfig.COLLABORATION_ENABLED) {
      if (nodeIdToDelete) socketManager.deselectElement(nodeIdToDelete)
      if (edgeIdToDelete) socketManager.deselectElement(edgeIdToDelete)
      if (nodeIdToDelete) socketManager.deleteElement(nodeIdToDelete)
      if (edgeIdToDelete) socketManager.deleteElement(edgeIdToDelete)
    }

    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    pendingRelationSourceId.current = null
  }

  useEffect(() => {
    const load = async () => {
      if (!diagramId) {
        setError('No se encontró el diagrama.')
        setLoading(false)
        return
      }

      setLoading(true)
      setError(null)

        try {
          const response = await diagramsService.getDiagram(diagramId)
          const content = materializeManyToMany(response.content ?? emptyContent())
          setDiagram({ ...response, content })
          setNodes(toNodes(content))
          setEdges(toEdges(content))
          historyRef.current = {
            past: [],
            future: [],
            diagramId,
          }
          clipboardRef.current = null
        } catch (err) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el diagrama')
        } finally {
        setLoading(false)
      }
    }

    void load()
  }, [diagramId, setEdges, setNodes])

  useEffect(() => {
    if (!diagramId || !asideOpen || sidebarMode !== 'chat') return undefined

    let cancelled = false
    const loadChat = async () => {
      setChatLoading(true)
      setChatError(null)

      try {
        const response = await diagramsAiService.getDiagramMessages(diagramId)
        if (!cancelled) setChatMessages(response.messages || [])
      } catch (err) {
        if (!cancelled) setChatError(err instanceof Error ? err.message : 'No se pudieron cargar los mensajes')
      } finally {
        if (!cancelled) setChatLoading(false)
      }
    }

    void loadChat()

    return () => {
      cancelled = true
    }
  }, [asideOpen, diagramId, sidebarMode])

  useEffect(() => {
    if (!asideOpen || sidebarMode !== 'chat') return
    chatScrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [asideOpen, chatMessages, chatSending, sidebarMode])

  useEffect(() => {
    return () => {
      chatAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      })
    }
  }, [chatAttachments])

  useEffect(() => {
    const SpeechRecognition = (window as Window & {
      SpeechRecognition?: new () => VoiceRecognition
      webkitSpeechRecognition?: new () => VoiceRecognition
    }).SpeechRecognition || (window as Window & {
      SpeechRecognition?: new () => VoiceRecognition
      webkitSpeechRecognition?: new () => VoiceRecognition
    }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setVoiceSupported(false)
      return undefined
    }

    setVoiceSupported(true)
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-ES'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        const transcript = String(result?.[0]?.transcript || '').trim()
        if (!transcript) continue

        if (result.isFinal) {
          voiceFinalRef.current = [voiceFinalRef.current, transcript].filter(Boolean).join(' ').trim()
          voiceInterimRef.current = ''
        } else {
          voiceInterimRef.current = transcript
        }
      }
    }

    recognition.onend = () => {
      setIsRecordingVoice(false)
      const combinedTranscript = [voiceSeedRef.current, voiceFinalRef.current, voiceInterimRef.current]
        .filter(Boolean)
        .join(' ')
        .trim()

      if (combinedTranscript) {
        setChatInput(combinedTranscript)
        chatInputRef.current = combinedTranscript
      }

      voiceSeedRef.current = ''
      voiceFinalRef.current = ''
      voiceInterimRef.current = ''

      if (pendingSendAfterVoiceStopRef.current) {
        pendingSendAfterVoiceStopRef.current = false
        window.setTimeout(() => {
          sendChatMessageRef.current?.()
        }, 0)
      }
    }

    recognition.onerror = (event: any) => {
      setIsRecordingVoice(false)
      setChatError(event?.error === 'not-allowed'
        ? 'El navegador bloqueó el micrófono'
        : 'No se pudo reconocer el audio')
    }

    voiceRecognitionRef.current = recognition

    return () => {
      recognition.abort()
      pendingSendAfterVoiceStopRef.current = false
      voiceRecognitionRef.current = null
    }
  }, [])

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    if (!AppConfig.COLLABORATION_ENABLED || !diagramId) {
      return undefined
    }

    let cancelled = false

    const onConnected = () => {
      if (!loadingRef.current && diagramId) socketManager.joinDiagram(diagramId)
    }

    const onDisconnected = () => {
      return undefined
    }

    const onError = (payload?: any) => {
      const message = typeof payload?.message === 'string' ? payload.message : 'Error de colaboración'
      setError(message)
    }

    const onUsersUpdated = (users?: any) => {
      const nextUsers = Array.isArray(users) ? users as CollaborationUser[] : []
      setCollaborationUsers(nextUsers)
      const activeIds = new Set(nextUsers.map((user) => String(user.id)))
      setCollaborationSelections((current) => {
        const next = { ...current }
        Object.keys(next).forEach((elementId) => {
          if (!activeIds.has(String(next[elementId].userId))) delete next[elementId]
        })
        return next
      })
    }

    const onLockedElements = (elements?: any) => {
      setCollaborationLocks((typeof elements === 'object' && elements !== null ? elements : {}) as Record<string, CollaborationLock>)
    }

    const onSelectedElements = (elements?: any) => {
      setCollaborationSelections((typeof elements === 'object' && elements !== null ? elements : {}) as Record<string, CollaborationSelection>)
    }

    const onElementLocked = (payload?: any) => {
      const elementId = getPayloadElementId(payload)
      const lockedBy = String(payload?.lockedBy ?? payload?.userId ?? payload?.user?.id ?? '')
      if (!elementId || !lockedBy) return
      setCollaborationLocks((current) => ({
        ...current,
        [elementId]: {
          userId: lockedBy,
          diagramId,
          timestamp: Date.now(),
        },
      }))
    }

    const onElementUnlocked = (payload?: any) => {
      const elementId = getPayloadElementId(payload)
      if (!elementId) return
      setCollaborationLocks((current) => {
        const next = { ...current }
        delete next[elementId]
        return next
      })
    }

    const onElementSelected = (payload?: any) => {
      const elementId = getPayloadElementId(payload)
      const selectedBy = String(payload?.selectedBy ?? payload?.userId ?? payload?.user?.id ?? '')
      if (!elementId || !selectedBy) return
      setCollaborationSelections((current) => ({
        ...current,
        [elementId]: {
          userId: selectedBy,
          diagramId: String(diagramId),
          timestamp: Date.now(),
        },
      }))
    }

    const onElementDeselected = (payload?: any) => {
      const elementId = getPayloadElementId(payload)
      const userId = String(payload?.deselectedBy ?? payload?.selectedBy ?? payload?.userId ?? payload?.user?.id ?? '')
      setCollaborationSelections((current) => {
        const next = { ...current }
        if (elementId) {
          delete next[elementId]
          return next
        }

        if (userId) {
          Object.keys(next).forEach((key) => {
            if (String(next[key].userId) === userId) delete next[key]
          })
        }
        return next
      })
    }

    const onLockFailed = (payload?: any) => {
      const message = payload?.reason === 'already_locked'
        ? 'El elemento ya está bloqueado por otro usuario'
        : 'No se pudo bloquear el elemento'
      setError(message)
    }

    const onElementAdded = (payload?: any) => {
      const element = payload?.element ?? payload
      if (!element?.id) return
      if (element.sourceId || element.targetId || element.source || element.target) {
        applyRemoteEdge(element)
        return
      }
      applyRemoteNode(element)
    }

    const onElementUpdated = (payload?: any) => {
      const elementId = String(payload?.elementId ?? payload?.id ?? payload?.changes?.element?.id ?? payload?.element?.id ?? '')
      const changes = payload?.changes?.element ?? payload?.element ?? payload?.changes ?? payload
      if (!elementId || !changes) return
      if (changes.sourceId || changes.targetId || changes.source || changes.target || changes.relationType) {
        applyRemoteEdgeUpdate(elementId, changes)
        return
      }
      applyRemoteNodeUpdate(elementId, changes)
    }

    const onElementDeleted = (payload?: any) => {
      const elementId = String(payload?.elementId ?? payload?.id ?? '')
      if (!elementId) return
      removeRemoteElement(elementId)
    }

    const subscriptions: Array<[Parameters<typeof socketManager.on>[0], (data?: any) => void]> = [
      ['socketConnected', onConnected],
      ['socketDisconnected', onDisconnected],
      ['socketError', onError],
      ['serverError', onError],
      ['usersUpdated', onUsersUpdated],
      ['lockedElements', onLockedElements],
      ['selectedElements', onSelectedElements],
      ['elementLocked', onElementLocked],
      ['elementUnlocked', onElementUnlocked],
      ['elementLockFailed', onLockFailed],
      ['elementSelected', onElementSelected],
      ['elementDeselected', onElementDeselected],
      ['elementAdded', onElementAdded],
      ['elementUpdated', onElementUpdated],
      ['elementDeleted', onElementDeleted],
    ]

    subscriptions.forEach(([event, handler]) => socketManager.on(event, handler))

    const ensureConnection = async () => {
      const connected = socketManager.isSocketConnected() || await socketManager.connect()
      if (cancelled) return
      return connected
    }

    void ensureConnection()

    return () => {
      cancelled = true
      subscriptions.forEach(([event, handler]) => socketManager.off(event, handler))
      socketManager.leaveDiagram(diagramId)
      socketManager.disconnect()
    }
  }, [diagramId])

  useEffect(() => {
    if (!AppConfig.COLLABORATION_ENABLED || !diagramId || loading || !socketManager.isSocketConnected()) return
    socketManager.joinDiagram(diagramId)
    return () => {
      socketManager.leaveDiagram(diagramId)
    }
  }, [diagramId, loading])

  useEffect(() => {
    if (loading || !diagramId) return
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)

    saveTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const content = toContent(nodes, edges)
          await diagramsService.quickUpdateDiagram(diagramId, content)
        } catch {
          // keep going, manual save still works
        }
      })()
    }, 750)

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current)
    }
  }, [nodes, edges, diagramId, loading])

  const openNodeEditor = useCallback((nodeId: string) => {
    const node = nodes.find((item) => item.id === nodeId)
    if (!node) return
    if (AppConfig.COLLABORATION_ENABLED) socketManager.lockElement(nodeId)
    setEditorMode('node')
    setEditorId(nodeId)
    setEditorName(node.data.name)
    setEditorAttributes(node.data.attributes.join('\n'))
    setEditorMethods(node.data.methods.join('\n'))
    setEditorLiterals(node.data.literals.join('\n'))
    setEditorOpen(true)
  }, [nodes])

  const openEdgeEditor = useCallback((edgeId: string) => {
    const edge = edges.find((item) => item.id === edgeId)
    if (!edge) return
    if (AppConfig.COLLABORATION_ENABLED) socketManager.lockElement(edgeId)
    const relationType = normalizeRelationType(edge.data?.relationType)
    setSelectedEdgeId(edgeId)
    setEditorMode('edge')
    setEditorRelationType(relationType)
    setEditorId(edgeId)
    const multiplicityMode = relationMultiplicityMode(relationType)
    setEditorSourceMultiplicity(multiplicityMode === 'none' ? '' : getRelationSourceMultiplicity(relationType, edge.data?.sourceMultiplicity))
    setEditorTargetMultiplicity(multiplicityMode === 'none' ? '' : getRelationTargetMultiplicity(relationType, edge.data?.targetMultiplicity) || '1')
    setEditorOpen(true)
  }, [edges])

  const captureSnapshot = useCallback((): DiagramSnapshot => ({
    nodes: nodesRef.current.map(cloneDiagramNode),
    edges: edgesRef.current.map(cloneDiagramEdge),
    selectedNodeId,
    selectedEdgeId,
  }), [selectedEdgeId, selectedNodeId])

  const pushHistory = useCallback(() => {
    historyRef.current.past.push(captureSnapshot())
    historyRef.current.future = []
  }, [captureSnapshot])

  const restoreSnapshot = useCallback((snapshot: DiagramSnapshot) => {
    setNodes(snapshot.nodes.map(cloneDiagramNode))
    setEdges(snapshot.edges.map(cloneDiagramEdge))
    setSelectedNodeId(snapshot.selectedNodeId)
    setSelectedEdgeId(snapshot.selectedEdgeId)
  }, [setEdges, setNodes])

  const undoChange = useCallback(() => {
    const { past, future } = historyRef.current
    const previous = past.pop()
    if (!previous) return

    future.push(captureSnapshot())
    restoreSnapshot(previous)
  }, [captureSnapshot, restoreSnapshot])

  const redoChange = useCallback(() => {
    const { past, future } = historyRef.current
    const next = future.pop()
    if (!next) return

    past.push(captureSnapshot())
    restoreSnapshot(next)
  }, [captureSnapshot, restoreSnapshot])

  const copySelection = useCallback(() => {
    if (selectedNodeId) {
      const node = nodesRef.current.find((item) => item.id === selectedNodeId)
      if (!node) return
      clipboardRef.current = { type: 'node', node: cloneDiagramNode(node) }
      return
    }

    if (selectedEdgeId) {
      const edge = edgesRef.current.find((item) => item.id === selectedEdgeId)
      if (!edge) return
      clipboardRef.current = { type: 'edge', edge: cloneDiagramEdge(edge) }
    }
  }, [selectedEdgeId, selectedNodeId])

  const pasteSelection = useCallback(() => {
    const clipboard = clipboardRef.current
    if (!clipboard) return

    pushHistory()

    if (clipboard.type === 'node') {
      const nodeId = createId()
      const nextNode: Node<DiagramNodeData> = {
        ...cloneDiagramNode(clipboard.node),
        id: nodeId,
        position: offsetPoint(clipboard.node.position),
        data: {
          ...clipboard.node.data,
          onEdit: openNodeEditor,
          themeMode,
        },
      }

      setNodes((current) => current.concat(nextNode))
      if (AppConfig.COLLABORATION_ENABLED) socketManager.addElement(serializeNodeForCollaboration(nextNode))
      setSelectedNodeId(nodeId)
      setSelectedEdgeId(null)
      return
    }

    const edgeId = createId()
    const nextEdge: Edge<DiagramEdgeData> = {
      ...cloneDiagramEdge(clipboard.edge),
      id: edgeId,
      data: {
        ...clipboard.edge.data,
        relationType: clipboard.edge.data?.relationType ?? 'association',
        sourceMultiplicity: clipboard.edge.data?.sourceMultiplicity ?? '1',
        targetMultiplicity: clipboard.edge.data?.targetMultiplicity ?? '1',
        onEdit: openEdgeEditor,
        themeMode,
      },
    }

    setEdges((current) => current.concat(nextEdge))
    if (AppConfig.COLLABORATION_ENABLED) socketManager.addElement(serializeEdgeForCollaboration(nextEdge))
    setSelectedEdgeId(edgeId)
    setSelectedNodeId(null)
  }, [openEdgeEditor, openNodeEditor, pushHistory, setEdges, setNodes, themeMode])

  const buildConversationHistory = useCallback((messages: DiagramChatMessage[]): DiagramChatConversationTurn[] => {
    const turns: DiagramChatConversationTurn[] = []
    let currentTurn: DiagramChatConversationTurn | null = null

    messages.forEach((message) => {
      if (message.role === 'user') {
        if (currentTurn) turns.push(currentTurn)
        currentTurn = { user: message.content, ai: '' }
        return
      }

      if (!currentTurn) {
        currentTurn = { user: '', ai: message.content }
        turns.push(currentTurn)
        currentTurn = null
        return
      }

      currentTurn.ai = message.content
      turns.push(currentTurn)
      currentTurn = null
    })

    return turns.filter((turn) => turn.user || turn.ai)
  }, [])

  const handleChatFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (!files.length) return

    const nextAttachments = files.map((file) => {
      const isImage = file.type.startsWith('image/')
      return {
        id: `${file.name}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        kind: isImage ? 'image' : 'document',
        previewUrl: isImage ? URL.createObjectURL(file) : null,
      } satisfies ChatAttachment
    })

    setChatAttachments((current) => current.concat(nextAttachments))
    event.target.value = ''
  }, [])

  const removeChatAttachment = useCallback((attachmentId: string) => {
    setChatAttachments((current) => {
      const target = current.find((attachment) => attachment.id === attachmentId)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return current.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const clearChatAttachments = useCallback(() => {
    setChatAttachments((current) => {
      current.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      })
      return []
    })
  }, [])

  const toggleVoiceRecording = useCallback(() => {
    const recognition = voiceRecognitionRef.current
    if (!recognition) {
      setChatError('Tu navegador no soporta grabación de voz')
      return
    }

    setChatError(null)

    if (isRecordingVoice) {
      pendingSendAfterVoiceStopRef.current = false
      recognition.stop()
      setIsRecordingVoice(false)
      return
    }

    voiceSeedRef.current = chatInput.trim()
    voiceFinalRef.current = ''
    voiceInterimRef.current = ''
    recognition.start()
    setIsRecordingVoice(true)
  }, [chatInput, isRecordingVoice])

  const applyAiActions = useCallback((actions: Array<Record<string, any>>) => {
    if (!Array.isArray(actions) || actions.length === 0) return

    pushHistory()

    const resolveNodeId = (reference: any) => {
      const raw = typeof reference === 'object' ? reference?.id ?? reference?.name ?? reference?.alias : reference
      if (!raw) return ''
      const value = String(raw)
      const lower = value.toLowerCase()
      const existing = nodesRef.current.find((node) =>
        node.id === value ||
        node.id === lower ||
        stripPrefix(node.data.name).toLowerCase() === lower ||
        node.data.name.toLowerCase() === lower
      )
      return existing?.id ?? value
    }

    const resolveEdgeId = (reference: any) => {
      const raw = typeof reference === 'object' ? reference?.id ?? reference?.name ?? reference?.alias : reference
      if (!raw) return ''
      const value = String(raw)
      const lower = value.toLowerCase()
      const existing = edgesRef.current.find((edge) => edge.id === value || edge.id === lower)
      return existing?.id ?? value
    }

    actions.forEach((action) => {
      const type = String(action?.type || '')
      const data = action?.data ?? {}

      if (type === 'create_class' || type === 'create_interface' || type === 'create_abstract_class' || type === 'create_enum') {
        const id = String(data.id ?? createId())
        const kind: UmlKind = type === 'create_interface' ? 'interface' : type === 'create_abstract_class' ? 'abstract' : type === 'create_enum' ? 'enum' : 'class'
        const nextNode: Node<DiagramNodeData> = {
          id,
          type: 'umlNode',
          position: data.position ?? { x: 100, y: 100 },
          data: {
            name: String(data.name ?? 'Class'),
            kind,
            attributes: Array.isArray(data.attributes) ? data.attributes : [],
            methods: Array.isArray(data.methods) ? data.methods : [],
            literals: Array.isArray(data.literals) ? data.literals : [],
            onEdit: openNodeEditor,
            themeMode,
          },
        }

        setNodes((current) => {
          const exists = current.some((node) => node.id === id)
          if (!exists) return current.concat(nextNode)
          return current.map((node) => node.id === id ? { ...node, ...nextNode, data: { ...node.data, ...nextNode.data } } : node)
        })
        return
      }

      if (type === 'create_relationship') {
        const id = String(data.id ?? createId())
        const source = resolveNodeId(data.sourceId ?? data.source ?? data.sourceName)
        const target = resolveNodeId(data.targetId ?? data.target ?? data.targetName)
        if (!source || !target) return

        const relationType = normalizeRelationType(data.type ?? data.relationType ?? 'association')
        const endpoints = normalizeEnumUsageEndpoints(relationType, { source, target }, new Map(nodesRef.current.map((node) => [node.id, { type: kindToType(node.data.kind), name: node.data.name }])))
        const nextEdge: Edge<DiagramEdgeData> = {
          id,
          source: endpoints.source,
          target: endpoints.target,
          type: 'umlEdge',
          data: {
            relationType,
            sourceMultiplicity: data.sourceMultiplicity ?? '1',
            targetMultiplicity: data.targetMultiplicity ?? '1',
            onEdit: openEdgeEditor,
            themeMode,
          },
        }

        setEdges((current) => {
          const exists = current.some((edge) => edge.id === id)
          if (!exists) return current.concat(nextEdge)
          return current.map((edge) => edge.id === id ? ({ ...edge, ...nextEdge, data: { ...edge.data, ...nextEdge.data } } as Edge<DiagramEdgeData>) : edge)
        })
        return
      }

      if (type === 'delete_element') {
        const targetId = resolveNodeId(data.targetId ?? data.id)
        const nodeExists = nodesRef.current.some((node) => node.id === targetId)
        if (nodeExists) {
          setNodes((current) => current.filter((node) => node.id !== targetId))
          setEdges((current) => current.filter((edge) => edge.source !== targetId && edge.target !== targetId))
          return
        }
        const edgeId = resolveEdgeId(data.targetId ?? data.id)
        if (edgesRef.current.some((edge) => edge.id === edgeId)) setEdges((current) => current.filter((edge) => edge.id !== edgeId))
        return
      }

      const targetId = resolveNodeId(data.targetId ?? data.id)
      if (targetId) {
        setNodes((current) => current.map((node) => {
          if (node.id !== targetId) return node

          const nextAttributes = Array.isArray(data.attributes)
            ? data.attributes
            : Array.isArray(data.addAttributes)
              ? [...node.data.attributes, ...data.addAttributes]
              : Array.isArray(data.removeAttributes)
                ? node.data.attributes.filter((attribute) => !data.removeAttributes.includes(attribute))
                : node.data.attributes

          return {
            ...node,
            position: data.position ?? node.position,
            data: {
              ...node.data,
              ...(typeof data.name === 'string' ? { name: stripPrefix(data.name) } : {}),
              ...(Array.isArray(data.methods) ? { methods: data.methods } : {}),
              ...(Array.isArray(data.literals) ? { literals: data.literals } : {}),
              attributes: nextAttributes,
              themeMode,
            },
          }
        }))
        return
      }

      const edgeId = resolveEdgeId(data.targetId ?? data.id)
      if (edgeId) {
        setEdges((current) => current.map((edge) => {
          if (edge.id !== edgeId) return edge
          return {
            ...edge,
            source: data.sourceId ? resolveNodeId(data.sourceId) : edge.source,
            target: data.targetId ? resolveNodeId(data.targetId) : edge.target,
            data: {
              ...edge.data,
              ...(typeof data.type === 'string' ? { relationType: normalizeRelationType(data.type) } : {}),
              ...(typeof data.relationType === 'string' ? { relationType: normalizeRelationType(data.relationType) } : {}),
              ...(typeof data.sourceMultiplicity === 'string' ? { sourceMultiplicity: data.sourceMultiplicity } : {}),
              ...(typeof data.targetMultiplicity === 'string' ? { targetMultiplicity: data.targetMultiplicity } : {}),
              onEdit: openEdgeEditor,
              themeMode,
            },
          } as Edge<DiagramEdgeData>
        }))
        return
      }

    })
  }, [openEdgeEditor, openNodeEditor, pushHistory, setEdges, setNodes, themeMode])

  const addNode = (kind: UmlKind) => {
    pushHistory()
    const position = reactFlow.screenToFlowPosition({ x: window.innerWidth * 0.45, y: window.innerHeight * 0.25 })
    const name = kind === 'interface' ? 'NewInterface' : kind === 'abstract' ? 'NewAbstract' : kind === 'enum' ? 'NewEnum' : 'NewClass'
    const newNode: Node<DiagramNodeData> = {
      id: createId(),
      type: 'umlNode',
      position,
      data: {
        name,
        kind,
        attributes: kind === 'interface' || kind === 'enum' ? [] : ['+attribute1: type', '-attribute2: type'],
        methods: kind === 'interface' || kind === 'enum' ? [] : ['+method1(): returnType', '-method2(param: type): returnType'],
        literals: kind === 'enum' ? ['VALUE_ONE', 'VALUE_TWO'] : [],
        onEdit: openNodeEditor,
      },
    }
    setNodes((current) => current.concat(newNode))
    if (AppConfig.COLLABORATION_ENABLED) socketManager.addElement(serializeNodeForCollaboration(newNode))
    setTool('select')
  }

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    const newEdge = buildEdge(connection.source, connection.target)
    if (!newEdge) return
    pushHistory()
    setEdges((current) => current.concat(newEdge))
    if (AppConfig.COLLABORATION_ENABLED) socketManager.addElement(serializeEdgeForCollaboration(newEdge))
  }, [buildEdge, pushHistory, setEdges])

  const onReconnect = useCallback((oldEdge: Edge<DiagramEdgeData>, connection: Connection) => {
    pushHistory()
    const relationType = normalizeRelationType(oldEdge.data?.relationType)
    const endpoints = normalizeEnumUsageEndpoints(relationType, {
      source: connection.source ?? oldEdge.source,
      target: connection.target ?? oldEdge.target,
    }, new Map(nodesRef.current.map((node) => [node.id, { type: kindToType(node.data.kind), name: node.data.name }])))
    const updatedEdge = { ...oldEdge, ...endpoints, data: oldEdge.data } as Edge<DiagramEdgeData>
    setEdges((current) => reconnectEdge(oldEdge, { ...connection, source: endpoints.source, target: endpoints.target }, current) as Array<Edge<DiagramEdgeData>>)
    syncCursorToEdge(updatedEdge)
    if (AppConfig.COLLABORATION_ENABLED) socketManager.updateElement(oldEdge.id, serializeEdgeForCollaboration(updatedEdge))
  }, [pushHistory, setEdges])

  const clearCurrentSelection = useCallback(() => {
    if (AppConfig.COLLABORATION_ENABLED) {
      if (selectedNodeId) socketManager.deselectElement(selectedNodeId)
      if (selectedEdgeId) socketManager.deselectElement(selectedEdgeId)
    }

    setSelectedNodeId(null)
    setSelectedEdgeId(null)
  }, [selectedEdgeId, selectedNodeId])

  const applyRemoteNode = (payload: any) => {
    const element = (payload?.element ?? payload) as CollaborationElementPayload
    if (!element?.id) return

    const kind = typeToKind(element.type, element.name)
    const nextNode: Node<DiagramNodeData> = {
      id: String(element.id),
      type: 'umlNode',
      position: element.position ?? { x: 80, y: 80 },
      data: {
        name: stripPrefix(String(element.name ?? 'Class')),
        kind,
        attributes: Array.isArray(element.attributes) ? element.attributes : [],
        methods: Array.isArray(element.methods) ? element.methods : [],
        literals: Array.isArray(element.literals) ? element.literals : [],
      },
    }

    setNodes((current) => {
      const exists = current.some((node) => node.id === nextNode.id)
      if (!exists) return current.concat(nextNode)
      return current.map((node) => node.id === nextNode.id ? {
        ...node,
        position: nextNode.position,
        data: { ...node.data, ...nextNode.data },
      } : node)
    })
  }

  const applyRemoteEdge = (payload: any) => {
    const element = (payload?.element ?? payload) as CollaborationElementPayload
    if (!element?.id) return

    const relationType = normalizeRelationType(element.type)
    const nextEdge: Edge<DiagramEdgeData> = {
      id: String(element.id),
      source: String(element.sourceId ?? element.source ?? ''),
      target: String(element.targetId ?? element.target ?? ''),
      type: 'umlEdge',
      data: {
        relationType,
        sourceMultiplicity: element.sourceMultiplicity ?? '1',
        targetMultiplicity: element.targetMultiplicity ?? '1',
      },
    }

    const endpoints = normalizeEnumUsageEndpoints(relationType, { source: nextEdge.source, target: nextEdge.target }, new Map(nodesRef.current.map((node) => [node.id, { type: kindToType(node.data.kind), name: node.data.name }])))
    nextEdge.source = endpoints.source
    nextEdge.target = endpoints.target

    if (!nextEdge.source || !nextEdge.target) return
    const nextEdgeData = nextEdge.data ?? {
      relationType: 'association' as UmlRelation,
      sourceMultiplicity: '1',
      targetMultiplicity: '1',
    }

    setEdges((current) => {
      const exists = current.some((edge) => edge.id === nextEdge.id)
      if (!exists) return current.concat(nextEdge)
      return current.map((edge) => edge.id === nextEdge.id ? ({
        ...edge,
        source: nextEdge.source,
        target: nextEdge.target,
        type: 'umlEdge',
        data: {
          relationType: nextEdgeData.relationType,
          sourceMultiplicity: nextEdgeData.sourceMultiplicity,
          targetMultiplicity: nextEdgeData.targetMultiplicity,
          onEdit: edge.data?.onEdit,
          themeMode: edge.data?.themeMode,
        },
      } as Edge<DiagramEdgeData>) : edge)
    })
  }

  const applyRemoteNodeUpdate = (elementId: string, changes: any) => {
    const nextChanges = changes?.element ?? changes
    setNodes((current) => current.map((node) => {
      if (node.id !== elementId) return node
      return {
        ...node,
        position: nextChanges?.position ?? node.position,
        data: {
          ...node.data,
          ...(nextChanges?.data ?? {}),
          ...(typeof nextChanges?.name === 'string' ? { name: stripPrefix(nextChanges.name) } : {}),
          ...(Array.isArray(nextChanges?.attributes) ? { attributes: nextChanges.attributes } : {}),
          ...(Array.isArray(nextChanges?.methods) ? { methods: nextChanges.methods } : {}),
          ...(Array.isArray(nextChanges?.literals) ? { literals: nextChanges.literals } : {}),
        },
      }
    }))
  }

  const applyRemoteEdgeUpdate = (elementId: string, changes: any) => {
    const nextChanges = changes?.element ?? changes
    setEdges((current) => current.map((edge) => {
      if (edge.id !== elementId) return edge
      return {
        ...edge,
        source: nextChanges?.sourceId ?? nextChanges?.source ?? edge.source,
        target: nextChanges?.targetId ?? nextChanges?.target ?? edge.target,
        data: {
          ...edge.data,
          ...(typeof nextChanges?.relationType === 'string' ? { relationType: normalizeRelationType(nextChanges.relationType) } : {}),
          ...(typeof nextChanges?.sourceMultiplicity === 'string' ? { sourceMultiplicity: nextChanges.sourceMultiplicity } : {}),
          ...(typeof nextChanges?.targetMultiplicity === 'string' ? { targetMultiplicity: nextChanges.targetMultiplicity } : {}),
        },
      } as Edge<DiagramEdgeData>
    }))
  }

  const removeRemoteElement = (elementId: string) => {
    setNodes((current) => current.filter((node) => node.id !== elementId))
    setEdges((current) => current.filter((edge) => edge.id !== elementId && edge.source !== elementId && edge.target !== elementId))
    setSelectedNodeId((current) => current === elementId ? null : current)
    setSelectedEdgeId((current) => current === elementId ? null : current)
    setCollaborationLocks((current) => {
      const next = { ...current }
      delete next[elementId]
      return next
    })
    setCollaborationSelections((current) => {
      const next = { ...current }
      delete next[elementId]
      return next
    })
    if (editorId === elementId) {
      setEditorOpen(false)
      setEditorId(null)
    }
  }

  const emitNodePosition = (node: Node<DiagramNodeData>) => {
    if (!AppConfig.COLLABORATION_ENABLED) return
    socketManager.updateElement(node.id, {
      id: node.id,
      type: kindToType(node.data.kind),
      name: prefixName(node.data.kind, node.data.name),
      attributes: node.data.attributes,
      methods: node.data.methods,
      literals: node.data.literals,
      position: node.position,
      size: { width: NODE_WIDTH, height: getNodeHeight(node) },
    })
  }

  const syncNodePosition = useCallback((node: Node<DiagramNodeData>, immediate = false) => {
    if (!AppConfig.COLLABORATION_ENABLED) return
    if (immediate) {
      if (nodeSyncThrottleRef.current) {
        window.clearTimeout(nodeSyncThrottleRef.current)
        nodeSyncThrottleRef.current = null
      }
      emitNodePosition(node)
      return
    }

    if (nodeSyncThrottleRef.current) return
    emitNodePosition(node)
    nodeSyncThrottleRef.current = window.setTimeout(() => {
      nodeSyncThrottleRef.current = null
    }, 80)
  }, [])

  const syncCursorToNode = useCallback((node: Node<DiagramNodeData>) => {
    if (!AppConfig.COLLABORATION_ENABLED || !socketManager.isSocketConnected()) return
    socketManager.moveCursor(getNodeCursorAnchor(node))
  }, [])

  const syncCursorToEdge = useCallback((edge: Edge<DiagramEdgeData>) => {
    if (!AppConfig.COLLABORATION_ENABLED || !socketManager.isSocketConnected()) return
    const anchor = getEdgeCursorAnchor(edge, nodesRef.current)
    if (anchor) socketManager.moveCursor(anchor)
  }, [])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node<DiagramNodeData>) => {
    if (AppConfig.COLLABORATION_ENABLED) {
      if (selectedEdgeId) socketManager.deselectElement(selectedEdgeId)
      socketManager.selectElement(node.id)
    }
    if (!isRelationTool(tool)) {
      setSelectedNodeId(node.id)
      setSelectedEdgeId(null)
      return
    }

    if (!pendingRelationSourceId.current) {
      pendingRelationSourceId.current = node.id
      setError(null)
      return
    }

    if (pendingRelationSourceId.current === node.id) return

    pushHistory()
    const newEdge = buildEdge(pendingRelationSourceId.current, node.id)
    pendingRelationSourceId.current = null
    if (!newEdge) return
    setEdges((current) => current.concat(newEdge))
  }, [buildEdge, pushHistory, selectedEdgeId, setError, setSelectedEdgeId, setSelectedNodeId, tool])

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge<DiagramEdgeData>) => {
    if (AppConfig.COLLABORATION_ENABLED) {
      if (selectedNodeId) socketManager.deselectElement(selectedNodeId)
      socketManager.selectElement(edge.id)
    }
    setSelectedEdgeId(edge.id)
    setSelectedNodeId(null)
  }, [selectedNodeId, setSelectedEdgeId, setSelectedNodeId])

  const saveEditor = () => {
    if (!editorId) return
    if (editorMode === 'node') {
      pushHistory()
      let updatedNode: Node<DiagramNodeData> | null = null
      setNodes((current) => current.map((node) => {
        if (node.id !== editorId) return node
        const kind = node.data.kind
        const name = editorName.trim() || 'Class'
        updatedNode = {
          ...node,
          data: {
            ...node.data,
            name,
             attributes: kind === 'interface' || kind === 'enum' ? [] : editorAttributes.split('\n').map((line) => line.trim()).filter(Boolean),
             methods: kind === 'enum' ? [] : editorMethods.split('\n').map((line) => line.trim()).filter(Boolean),
             literals: kind === 'enum' ? editorLiterals.split('\n').map((line) => line.trim()).filter(Boolean) : [],
          },
        }
        return updatedNode
      }))
      if (AppConfig.COLLABORATION_ENABLED && updatedNode) socketManager.updateElement(editorId, serializeNodeForCollaboration(updatedNode))
    } else {
      pushHistory()
      const sourceMultiplicity = getRelationSourceMultiplicity(editorRelationType, editorSourceMultiplicity)
      const targetMultiplicity = getRelationTargetMultiplicity(editorRelationType, editorTargetMultiplicity)
      const currentEdge = edges.find((edge) => edge.id === editorId)
      const updatedEdge = currentEdge ? ({
        ...currentEdge,
        data: {
          ...currentEdge.data,
          relationType: currentEdge.data?.relationType ?? editorRelationType,
          sourceMultiplicity,
          targetMultiplicity,
        },
      } as Edge<DiagramEdgeData>) : null
      const updatedEdges = edges.map((edge) => edge.id === editorId ? ({
        ...edge,
        data: {
          ...edge.data,
          relationType: edge.data?.relationType ?? editorRelationType,
          sourceMultiplicity,
          targetMultiplicity,
        },
      } as Edge<DiagramEdgeData>) : edge)
      const normalizedContent = materializeManyToMany(toContent(nodes, updatedEdges))
      setNodes(toNodes(normalizedContent))
      setEdges(toEdges(normalizedContent))
      if (AppConfig.COLLABORATION_ENABLED && updatedEdge) socketManager.updateElement(editorId, serializeEdgeForCollaboration(updatedEdge))
    }

    if (AppConfig.COLLABORATION_ENABLED) socketManager.unlockElement(editorId)
    setEditorOpen(false)
    setEditorId(null)
    setSelectedEdgeId(null)
    setEditorRelationType('association')
  }

  const handleImportXmi = useCallback(async (content: DiagramContent) => {
    if (!diagramId) return

    pushHistory()
    const normalizedContent = materializeManyToMany(content)
    const nextNodes = toNodes(normalizedContent)
    const nextEdges = toEdges(normalizedContent)

    setNodes(nextNodes)
    setEdges(nextEdges)
    setDiagram((current) => (current ? { ...current, content: normalizedContent } : current))
    setSelectedNodeId(null)
    setSelectedEdgeId(null)
    setEditorOpen(false)
    setEditorId(null)
    pendingRelationSourceId.current = null

    await diagramsService.quickUpdateDiagram(diagramId, normalizedContent)
  }, [diagramId, pushHistory, setDiagram, setEdges, setNodes])

  const sendChatMessage = useCallback(async () => {
    const message = chatInputRef.current.trim()
    if (!diagramId || chatSending) return

    if (isRecordingVoice) {
      pendingSendAfterVoiceStopRef.current = true
      voiceRecognitionRef.current?.stop()
      setIsRecordingVoice(false)
      return
    }

    if (!message && chatAttachments.length === 0) return

    setChatSending(true)
    setChatError(null)

    try {
      const response = await diagramsAiService.chat({
        message,
        diagramId,
        diagramData: toContent(nodesRef.current, edgesRef.current),
        conversationHistory: buildConversationHistory(chatMessages),
        attachments: chatAttachments,
      })

      if (Array.isArray(response.actions) && response.actions.length > 0) {
        applyAiActions(response.actions as Array<Record<string, any>>)
      }

      setChatInput('')
      chatInputRef.current = ''
      clearChatAttachments()

      const refreshed = await diagramsAiService.getDiagramMessages(diagramId)
      setChatMessages(refreshed.messages || [])
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'No se pudo enviar el mensaje')
    } finally {
      setChatSending(false)
    }
  }, [applyAiActions, buildConversationHistory, chatAttachments, chatSending, clearChatAttachments, diagramId, edgesRef, isRecordingVoice, nodesRef, chatMessages])

  useEffect(() => {
    sendChatMessageRef.current = () => {
      void sendChatMessage()
    }
  }, [sendChatMessage])

  useEffect(() => {
    pendingRelationSourceId.current = null
  }, [tool])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (editorOpen) return

      const key = event.key.toLowerCase()
      const isMod = event.metaKey || event.ctrlKey

      if (isMod && !event.shiftKey && key === 'z') {
        event.preventDefault()
        undoChange()
        return
      }

      if (isMod && (key === 'y' || (event.shiftKey && key === 'z'))) {
        event.preventDefault()
        redoChange()
        return
      }

      if (isMod && key === 'c') {
        event.preventDefault()
        copySelection()
        return
      }

      if (isMod && key === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selectedNodeId && !selectedEdgeId) return

      event.preventDefault()
      deleteSelection()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [copySelection, deleteSelection, editorOpen, pasteSelection, redoChange, selectedEdgeId, selectedNodeId, undoChange])

  const editorRelationConfig = editorMode === 'edge' ? UML_RELATION_CONFIG[editorRelationType] : null
  const editorSourceMultiplicityValue = editorMode === 'edge' && editorRelationConfig?.sourceFixed ? editorRelationConfig.sourceFixed : editorSourceMultiplicity
  const editorNode = editorMode === 'node' && editorId ? nodes.find((node) => node.id === editorId) ?? null : null
  const selectionCollaborationStateById = useMemo(() => {
    const result: Record<string, { label: string; color: string }> = {}
    Object.entries(collaborationSelections).forEach(([elementId, selection]) => {
      const user = collaborationUsers.find((item) => item.id === selection.userId) ?? null
      result[elementId] = {
        label: getCollaboratorLabel(user),
        color: getCollaboratorColor(selection.userId),
      }
    })
    return result
  }, [collaborationSelections, collaborationUsers])

  const remoteMotionStateById = useMemo(() => {
    const next: Record<string, RemoteMotionState> = {}
    Object.entries(remoteMotionByElement).forEach(([elementId, state]) => {
      next[elementId] = state
    })
    return next
  }, [remoteMotionByElement])

  const handleRemoteMotionChange = useCallback((state: Record<string, RemoteMotionState>) => {
    setRemoteMotionByElement(state)
  }, [])

  const flowNodes = useMemo(() => nodes.map((node) => ({
    ...node,
    selected: selectedNodeId === node.id,
    data: {
      ...node.data,
      onEdit: openNodeEditor,
      themeMode,
      remoteSelectedColor: selectionCollaborationStateById[node.id]?.color,
      remoteSelectedLabel: selectionCollaborationStateById[node.id]?.label,
      remoteMovingColor: !selectedNodeId && !selectionCollaborationStateById[node.id] ? remoteMotionStateById[node.id]?.color : undefined,
    }
  })), [nodes, openNodeEditor, selectedNodeId, themeMode, selectionCollaborationStateById, remoteMotionStateById])

  const flowEdges = useMemo(() => {
    const nodesById = new Map(nodes.map((node) => [node.id, node]))
    return edges.map((edge) => {
      const associationClass = edge.data?.associationClassId ? nodesById.get(edge.data.associationClassId) : undefined
      return {
        ...edge,
        selected: selectedEdgeId === edge.id,
        type: 'umlEdge',
        data: {
          ...edge.data,
          relationType: edge.data?.relationType ?? 'association',
          associationClassPosition: associationClass ? { x: associationClass.position.x, y: associationClass.position.y, width: associationClass.measured?.width ?? NODE_WIDTH } : undefined,
          onEdit: openEdgeEditor,
          themeMode,
          remoteSelectedColor: selectionCollaborationStateById[edge.id]?.color,
          remoteSelectedLabel: selectionCollaborationStateById[edge.id]?.label,
          remoteMovingColor: !selectedEdgeId && !selectionCollaborationStateById[edge.id] ? remoteMotionStateById[edge.id]?.color : undefined,
          remoteMovingLabel: !selectedEdgeId && !selectionCollaborationStateById[edge.id] ? remoteMotionStateById[edge.id]?.label : undefined,
        },
      } as Edge<DiagramEdgeData>
    })
  }, [edges, nodes, openEdgeEditor, remoteMotionStateById, selectedEdgeId, selectionCollaborationStateById, themeMode])

  if (loading) return <div className="flex h-full min-h-0 items-center justify-center text-sm text-slate-500">Loading diagram...</div>

  return (
    <div className="h-[calc(100dvh-4.2rem)] min-h-0 overflow-hidden px-4 pb-4">
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="px-0 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button asChild variant="outline" className="justify-start px-4">
              <Link
                to={
                  projectId ? `/dashboard/projects/${projectId}` : '/dashboard'
                }
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver
              </Link>
            </Button>

            <div className="flex items-center gap-2 rounded-full bg-transparent backdrop-blur-sm pr-1">
              <DiagramCollaboratorsTooltip users={collaborationUsers} />
              <SpringbootGeneration
                diagramId={diagramId}
                classes={nodes.map((node) => ({ id: node.id, name: node.data.name }))}
                saveDiagram={async () => {
                  if (diagramId) await diagramsService.quickUpdateDiagram(diagramId, toContent(nodesRef.current, edgesRef.current))
                }}
              />
              <DiagramExportDropdown
                diagramName={diagram?.name}
                nodes={nodes}
                edges={edges}
                exportTargetRef={exportTargetRef}
              />
              <DiagramImportDropdown
                onImportXmi={(content) => {
                  void handleImportXmi(content)
                }}
              />
              <DiagramKeyboardShortcutsMenu
                onUndo={undoChange}
                onRedo={redoChange}
                onDelete={deleteSelection}
                onCopy={copySelection}
                onPaste={pasteSelection}
              />
            </div>
          </div>
        </div>

        <div
          className="grid min-h-0 flex-1 overflow-hidden"
          style={{
            gridTemplateColumns: `${asideOpen ? '320px' : '0px'} 48px 1fr`
          }}
        >
          <div className="min-w-0 overflow-hidden">
            {asideOpen ? (
              sidebarMode === 'elements' ? (
                <DiagramElementsSidebar
                  diagramName={diagram?.name}
                  diagramDescription={diagram?.description}
                  tool={tool}
                  onAddNode={addNode}
                  onToolChange={setTool}
                />
              ) : (
                <DiagramChatSidebar
                  messages={chatMessages}
                  loading={chatLoading}
                  error={chatError}
                  attachments={chatAttachments}
                  input={chatInput}
                  sending={chatSending}
                  recordingVoice={isRecordingVoice}
                  voiceSupported={voiceSupported}
                  chatFileInputRef={chatFileInputRef}
                  chatScrollEndRef={chatScrollEndRef}
                  onRemoveAttachment={removeChatAttachment}
                  onFileChange={handleChatFileChange}
                  onInputChange={(value) => {
                    setChatInput(value)
                    chatInputRef.current = value
                  }}
                  onInputKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void sendChatMessage()
                    }
                  }}
                  onToggleVoiceRecording={() => {
                    void toggleVoiceRecording()
                  }}
                  onSend={() => {
                    void sendChatMessage()
                  }}
                />
              )
            ) : null}
          </div>

          <div className="flex items-start justify-center bg-transparent">
            <div className="flex flex-col gap-2">
              <Button
                variant={
                  asideOpen && sidebarMode === 'elements'
                    ? 'default'
                    : 'outline'
                }
                size="icon"
                onClick={() => {
                  if (sidebarMode === 'chat') {
                    setSidebarMode('elements')
                    setAsideOpen(true)
                    return
                  }
                  setAsideOpen((current) => !current)
                }}
                aria-label={
                  asideOpen ? 'Ocultar panel lateral' : 'Mostrar panel lateral'
                }
                className="shadow-md"
              >
                <PanelLeftIcon className="h-4 w-4" />
              </Button>
              <Button
                variant={
                  asideOpen && sidebarMode === 'chat' ? 'default' : 'outline'
                }
                size="icon"
                onClick={() => {
                  if (asideOpen && sidebarMode === 'chat') {
                    setAsideOpen(false)
                    return
                  }

                  setSidebarMode('chat')
                  setAsideOpen(true)
                }}
                aria-label={
                  asideOpen && sidebarMode === 'chat'
                    ? 'Cerrar chat IA'
                    : 'Abrir chat IA'
                }
                className="shadow-md"
              >
                <Bot className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <DiagramCanvasSurface
            users={collaborationUsers}
            nodes={nodes}
            edges={edges}
            flowNodes={flowNodes}
            flowEdges={flowEdges}
            themeMode={themeMode}
            minimapProps={minimapProps}
            exportTargetRef={exportTargetRef}
            onRemoteMotionChange={handleRemoteMotionChange}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onReconnect={onReconnect}
            onNodeDrag={(_, node) => {
              syncNodePosition(node)
              syncCursorToNode(node)
            }}
            onNodeDragStop={(_, node) => {
              syncNodePosition(node, true)
              syncCursorToNode(node)
            }}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onNodeDoubleClick={(_, node) => {
              openNodeEditor(node.id)
            }}
            onPaneClick={(event) => {
              pushHistory()
              clearCurrentSelection()
              if (
                tool !== 'class' &&
                tool !== 'interface' &&
                tool !== 'abstract' &&
                tool !== 'enum'
              )
                return
              const position = reactFlow.screenToFlowPosition({
                x: event.clientX,
                y: event.clientY
              })
              const kind =
                tool === 'class'
                  ? 'class'
                  : tool === 'interface'
                    ? 'interface'
                    : tool === 'abstract'
                      ? 'abstract'
                      : 'enum'
              const name =
                kind === 'interface'
                  ? 'NewInterface'
                  : kind === 'abstract'
                    ? 'NewAbstract'
                    : kind === 'enum'
                      ? 'NewEnum'
                      : 'NewClass'
              const newNode: Node<DiagramNodeData> = {
                id: createId(),
                type: 'umlNode',
                position,
                data: {
                  name,
                  kind,
                  attributes:
                    kind === 'interface' || kind === 'enum'
                      ? []
                      : ['+attribute1: type', '-attribute2: type'],
                  methods:
                    kind === 'interface' || kind === 'enum'
                      ? []
                      : [
                          '+method1(): returnType',
                          '-method2(param: type): returnType'
                        ],
                  literals: kind === 'enum' ? ['VALUE_ONE', 'VALUE_TWO'] : [],
                  onEdit: openNodeEditor
                }
              }
              setNodes((current) => current.concat(newNode))
              if (AppConfig.COLLABORATION_ENABLED)
                socketManager.addElement(
                  serializeNodeForCollaboration(newNode)
                )
              setTool('select')
            }}
          />
        </div>
      </div>

      <DiagramEditorDialog
        open={editorOpen}
        mode={editorMode}
        relationConfig={editorRelationConfig}
        nodeHasAttributes={editorNode?.data.kind !== 'interface' && editorNode?.data.kind !== 'enum'}
        nodeIsEnum={editorNode?.data.kind === 'enum'}
        name={editorName}
        attributes={editorAttributes}
        literals={editorLiterals}
        methods={editorMethods}
        sourceMultiplicity={editorSourceMultiplicity}
        targetMultiplicity={editorTargetMultiplicity}
        sourceMultiplicityValue={editorSourceMultiplicityValue}
        onOpenChange={(open) => {
          if (!open && AppConfig.COLLABORATION_ENABLED && editorId)
            socketManager.unlockElement(editorId)
          setEditorOpen(open)
          if (!open) setEditorId(null)
        }}
        onNameChange={setEditorName}
        onAttributesChange={setEditorAttributes}
        onLiteralsChange={setEditorLiterals}
        onMethodsChange={setEditorMethods}
        onSourceMultiplicityChange={setEditorSourceMultiplicity}
        onTargetMultiplicityChange={setEditorTargetMultiplicity}
        onSave={saveEditor}
      />

      {error ? (
        <div className="fixed bottom-6 left-6 z-50 flex max-w-sm items-start gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  )
}

const DiagramFlowPage = () => {
  return (
    <ReactFlowProvider>
      <DiagramFlow />
    </ReactFlowProvider>
  )
}

export default DiagramFlowPage

import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Background, BaseEdge, Controls, EdgeLabelRenderer, Handle, MiniMap, Position, ReactFlow, ConnectionLineType, getSmoothStepPath, useReactFlow, useUpdateNodeInternals, type Connection, type Edge, type EdgeProps, type Node, type NodeProps, useEdgesState, useNodesState } from '@xyflow/react'
import { MousePointer2 } from 'lucide-react'

import { AppConfig } from '@/config/app.config'

import { socketManager } from '../socketManager'
import { type HandleSide, type HandleSlots } from '../handle-distribution'
import { formatUmlAttributeLabel, formatUmlMethodLabel, parseUmlAttribute, parseUmlMethod } from '../uml-member-format'
import type { UmlMemberSemantics } from '../models/diagram.model'

type UmlKind = 'class' | 'interface' | 'abstract' | 'enum'
type UmlRelation = 'association' | 'dependency' | 'enumUsage' | 'inheritance' | 'implementation' | 'composition' | 'aggregation'

interface DiagramNodeData extends Record<string, unknown> {
  name: string
  kind: UmlKind
  attributes: string[]
  methods: string[]
  literals: string[]
  attributeSemantics?: UmlMemberSemantics[]
  methodSemantics?: UmlMemberSemantics[]
  onEdit?: (id: string) => void
  themeMode?: 'light' | 'dark'
  remoteSelectedColor?: string
  remoteSelectedLabel?: string
  remoteMovingColor?: string
  handleSlots?: HandleSlots
}

interface DiagramEdgeData extends Record<string, unknown> {
  relationType: UmlRelation
  sourceMultiplicity: string
  targetMultiplicity: string
  sourceRoleName?: string
  targetRoleName?: string
  sourceNavigable?: boolean
  targetNavigable?: boolean
  stereotype?: string
  usage?: string
  waypoints?: Array<{ x: number; y: number }>
  onEdit?: (id: string) => void
  themeMode?: 'light' | 'dark'
  remoteSelectedColor?: string
  remoteSelectedLabel?: string
  remoteMovingColor?: string
  remoteMovingLabel?: string
  parallelGroupSize?: number
  parallelOrder?: number
  parallelOffsetDirection?: number
}

type CollaborationUser = {
  id: string
  username?: string
  firstName?: string
  lastName?: string
}

type CollaborationCursor = {
  userId: string
  username?: string
  firstName?: string
  position: { x: number; y: number }
  timestamp: string
  attachedNodeId?: string
  attachedElementId?: string
}

type RemoteMotionState = {
  color: string
  label: string
}

const NODE_WIDTH = 260

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

const getNodeHeight = (node: Pick<Node<DiagramNodeData>, 'data'>) => 120 + Math.max(node.data.attributes.length, node.data.methods.length, node.data.literals.length) * 20

const getNodeBounds = (node: Pick<Node<DiagramNodeData>, 'position' | 'data'>) => ({
  x: node.position.x,
  y: node.position.y,
  width: NODE_WIDTH,
  height: getNodeHeight(node),
})

const getNodeCenter = (node: Pick<Node<DiagramNodeData>, 'position' | 'data'>) => ({
  x: node.position.x + NODE_WIDTH / 2,
  y: node.position.y + getNodeHeight(node) / 2,
})

const getSnappedPointOnRect = (
  rect: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number }
) => {
  const clampedX = Math.max(rect.x, Math.min(point.x, rect.x + rect.width))
  const clampedY = Math.max(rect.y, Math.min(point.y, rect.y + rect.height))
  const distances = [
    { x: rect.x, y: clampedY, distance: Math.abs(point.x - rect.x) },
    { x: rect.x + rect.width, y: clampedY, distance: Math.abs(point.x - (rect.x + rect.width)) },
    { x: clampedX, y: rect.y, distance: Math.abs(point.y - rect.y) },
    { x: clampedX, y: rect.y + rect.height, distance: Math.abs(point.y - (rect.y + rect.height)) },
  ]

  return distances.reduce((best, current) => (current.distance < best.distance ? current : best))
}

const getCursorAttachment = (
  cursorPosition: { x: number; y: number },
  diagramNodes: Array<Node<DiagramNodeData>>
) : { point: { x: number; y: number }; distance: number; node: Node<DiagramNodeData> } | null => {
  let best: { point: { x: number; y: number }; distance: number; node: Node<DiagramNodeData> } | null = null

  diagramNodes.forEach((node) => {
    const bounds = getNodeBounds(node)
    const isInside =
      cursorPosition.x >= bounds.x &&
      cursorPosition.x <= bounds.x + bounds.width &&
      cursorPosition.y >= bounds.y &&
      cursorPosition.y <= bounds.y + bounds.height

    if (!isInside) return

    const distance = 0

    const snapped = getSnappedPointOnRect(bounds, cursorPosition)
    if (!best || distance < best.distance) best = { point: { x: snapped.x, y: snapped.y }, distance, node }
  })

  return best
}

const getPointToSegmentDistance = (
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number }
) => {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) {
    return {
      distance: Math.hypot(point.x - start.x, point.y - start.y),
      point: start,
    }
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  }

  return {
    distance: Math.hypot(point.x - projection.x, point.y - projection.y),
    point: projection,
  }
}

const getEdgeCursorAttachment = (
  cursorPosition: { x: number; y: number },
  diagramEdges: Array<Edge<DiagramEdgeData>>,
  diagramNodes: Array<Node<DiagramNodeData>>
) : { point: { x: number; y: number }; distance: number; edge: Edge<DiagramEdgeData> } | null => {
  let best: { point: { x: number; y: number }; distance: number; edge: Edge<DiagramEdgeData> } | null = null

  diagramEdges.forEach((edge) => {
    const source = diagramNodes.find((node) => node.id === edge.source)
    const target = diagramNodes.find((node) => node.id === edge.target)
    if (!source || !target) return

    const start = getNodeCenter(source)
    const end = getNodeCenter(target)
    const attachment = getPointToSegmentDistance(cursorPosition, start, end)
    if (attachment.distance > 14) return

    if (!best || attachment.distance < best.distance) {
      best = { point: attachment.point, distance: attachment.distance, edge }
    }
  })

  return best
}

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

const toCanvasPosition = (position: { x: number; y: number }, viewport: { x: number; y: number; zoom: number }) => ({
  x: position.x * viewport.zoom + viewport.x,
  y: position.y * viewport.zoom + viewport.y,
})

const normalizeRelationType = (relationType?: string | null): UmlRelation => {
  if (relationType === 'navigable') return 'dependency'
  if (relationType === 'enumUsage') return 'dependency'
  if (relationType === 'dependency') return 'dependency'
  if (relationType === 'enumUsage') return 'enumUsage'
  if (relationType === 'inheritance') return 'inheritance'
  if (relationType === 'implementation') return 'implementation'
  if (relationType === 'composition') return 'composition'
  if (relationType === 'aggregation') return 'aggregation'
  return 'association'
}

const relationTheme: Record<UmlRelation, { color: string, dash?: string }> = {
  association: { color: '#6b7280' },
  dependency: { color: '#374151', dash: '6 4' },
  enumUsage: { color: '#0f766e', dash: '6 4' },
  inheritance: { color: '#111827' },
  implementation: { color: '#111827', dash: '6 4' },
  composition: { color: '#4f46e5' },
  aggregation: { color: '#4f46e5' },
}

const relationThemeDark: Record<UmlRelation, { color: string, dash?: string }> = {
  association: { color: '#cbd5e1' },
  dependency: { color: '#94a3b8', dash: '6 4' },
  enumUsage: { color: '#5eead4', dash: '6 4' },
  inheritance: { color: '#e2e8f0' },
  implementation: { color: '#e2e8f0', dash: '6 4' },
  composition: { color: '#a5b4fc' },
  aggregation: { color: '#a5b4fc' },
}

const UML_RELATION_CONFIG: Record<UmlRelation, { hasMultiplicity: boolean, sourceFixed?: string }> = {
  association: { hasMultiplicity: true },
  aggregation: { hasMultiplicity: true },
  composition: { hasMultiplicity: true, sourceFixed: '1' },
  inheritance: { hasMultiplicity: false },
  implementation: { hasMultiplicity: false },
  dependency: { hasMultiplicity: false },
  enumUsage: { hasMultiplicity: false },
}

const getRelationSourceMultiplicity = (relationType: UmlRelation, value?: string | null) => {
  const config = UML_RELATION_CONFIG[relationType]
  return (config.sourceFixed ?? value?.trim()) || '1'
}

const getRelationTargetMultiplicity = (relationType: UmlRelation, value?: string | null) => {
  if (!UML_RELATION_CONFIG[relationType].hasMultiplicity) return ''
  return value?.trim() || '1'
}

const UmlMarkerDefs = ({ themeMode }: { themeMode?: 'light' | 'dark' }) => (
  <svg style={{ position: 'absolute', width: 0, height: 0, pointerEvents: 'none' }}>
    <defs>
      <marker id="uml-arrow-open" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse">
        <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke={themeMode === 'dark' ? '#cbd5e1' : '#374151'} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </marker>
      <marker id="uml-triangle-hollow" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="12" markerHeight="12" orient="auto-start-reverse">
        <polygon points="1 1, 10 6, 1 11" fill="hsl(var(--background))" stroke={themeMode === 'dark' ? '#e2e8f0' : '#111827'} strokeWidth="1.5" strokeLinejoin="round" />
      </marker>
      <marker id="uml-diamond-hollow" viewBox="0 0 16 16" refX="15" refY="8" markerWidth="14" markerHeight="14" orient="auto-start-reverse">
        <polygon points="8 1, 15 8, 8 15, 1 8" fill="hsl(var(--background))" stroke={themeMode === 'dark' ? '#a5b4fc' : '#4f46e5'} strokeWidth="1.5" strokeLinejoin="round" />
      </marker>
      <marker id="uml-diamond-filled" viewBox="0 0 16 16" refX="15" refY="8" markerWidth="14" markerHeight="14" orient="auto-start-reverse">
        <polygon points="8 1, 15 8, 8 15, 1 8" fill={themeMode === 'dark' ? '#a5b4fc' : '#4f46e5'} stroke={themeMode === 'dark' ? '#a5b4fc' : '#4f46e5'} strokeWidth="1.5" strokeLinejoin="round" />
      </marker>
    </defs>
  </svg>
)

export const getBadgePosition = (
  x: number,
  y: number,
  position: Position,
) => {
  switch (position) {
    case Position.Top:
      return { x: x + 21, y: y - 30 }
    case Position.Bottom:
      return { x: x + 21, y: y + 30 }
    case Position.Left:
      return { x: x - 25, y: y - 22 }
    case Position.Right:
      return { x: x + 25, y: y - 22 }
    default:
      return { x, y }
  }
}

const UmlEdge = ({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, data, selected }: EdgeProps<Edge<DiagramEdgeData>>) => {
  const relationType = normalizeRelationType(data?.relationType)
  const theme = data?.themeMode === 'dark' ? relationThemeDark[relationType] : relationTheme[relationType]
  const isDark = data?.themeMode === 'dark'
  const isRemoteSelected = Boolean(data?.remoteSelectedColor)
  const isRemoteMoving = Boolean(data?.remoteMovingColor) && !selected && !isRemoteSelected
  const parallelOffset = ((data?.parallelOrder ?? 0) - ((data?.parallelGroupSize ?? 1) - 1) / 2) * 24 * (data?.parallelOffsetDirection ?? 1)
  const distance = Math.hypot(targetX - sourceX, targetY - sourceY) || 1
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX: (sourceX + targetX) / 2 - (targetY - sourceY) / distance * parallelOffset,
    centerY: (sourceY + targetY) / 2 + (targetX - sourceX) / distance * parallelOffset,
    borderRadius: 12,
  })
  const associationClassPosition = data?.associationClassPosition as { x: number; y: number; width?: number } | undefined
  const associationClassPath = data?.associationClassId && !data.associationClassLink && associationClassPosition
    ? `M ${(sourceX + targetX) / 2} ${(sourceY + targetY) / 2} L ${associationClassPosition.x + (associationClassPosition.width ?? 260) / 2} ${associationClassPosition.y}`
    : null
  const edgeVisual = {
     composition: { strokeDasharray: undefined, markerStart: 'url(#uml-diamond-filled)', markerEnd: data?.targetNavigable ? 'url(#uml-arrow-open)' : undefined },
     aggregation: { strokeDasharray: undefined, markerStart: 'url(#uml-diamond-hollow)', markerEnd: data?.targetNavigable ? 'url(#uml-arrow-open)' : undefined },
    inheritance: { strokeDasharray: undefined, markerStart: undefined, markerEnd: 'url(#uml-triangle-hollow)' },
    implementation: { strokeDasharray: '6 4', markerStart: undefined, markerEnd: 'url(#uml-triangle-hollow)' },
    dependency: { strokeDasharray: '6 4', markerStart: undefined, markerEnd: 'url(#uml-arrow-open)' },
    enumUsage: { strokeDasharray: '6 4', markerStart: undefined, markerEnd: 'url(#uml-arrow-open)' },
     association: { strokeDasharray: undefined, markerStart: data?.sourceNavigable ? 'url(#uml-arrow-open)' : undefined, markerEnd: data?.targetNavigable ? 'url(#uml-arrow-open)' : undefined },
  }[relationType]

  const sourceMultiplicity = getRelationSourceMultiplicity(relationType, data?.sourceMultiplicity)
  const targetMultiplicity = getRelationTargetMultiplicity(relationType, data?.targetMultiplicity)
  const sourceBadgePosition = getBadgePosition(sourceX, sourceY, sourcePosition)
  const targetBadgePosition = getBadgePosition(targetX, targetY, targetPosition)

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerStart={edgeVisual.markerStart}
        markerEnd={edgeVisual.markerEnd}
        interactionWidth={20}
        style={{
          cursor: 'pointer',
          stroke: selected || isRemoteSelected
            ? (data?.remoteSelectedColor ?? (isDark ? '#60a5fa' : '#2563eb'))
            : isRemoteMoving
              ? (data?.remoteMovingColor ?? theme.color)
              : theme.color,
          strokeWidth: selected || isRemoteSelected || isRemoteMoving ? 3.5 : 1.75,
          strokeDasharray: edgeVisual.strokeDasharray,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          filter: selected || isRemoteSelected || isRemoteMoving ? `drop-shadow(0 0 5px ${data?.remoteSelectedColor ?? data?.remoteMovingColor ?? (isDark ? 'rgba(96,165,250,0.35)' : 'rgba(37,99,235,0.28)')})` : undefined,
        }}
      />
      {associationClassPath ? (
        <path
          d={associationClassPath}
          fill="none"
          stroke={isDark ? '#cbd5e1' : '#64748b'}
          strokeWidth={1.5}
          strokeDasharray="5 4"
          pointerEvents="none"
        />
      ) : null}
      {isRemoteSelected || isRemoteMoving ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2}px)`,
              pointerEvents: 'none',
              zIndex: 20,
            }}
          >
            <div
              style={{
                borderRadius: 9999,
                background: data?.remoteSelectedColor ?? data?.remoteMovingColor,
                color: '#fff',
                padding: '3px 8px',
                fontSize: 10,
                fontWeight: 700,
                boxShadow: `0 6px 16px ${(data?.remoteSelectedColor ?? data?.remoteMovingColor)}33`,
                whiteSpace: 'nowrap',
              }}
            >
              {data?.remoteSelectedLabel ?? data?.remoteMovingLabel}
            </div>
          </div>
        </EdgeLabelRenderer>
      ) : null}
      <EdgeLabelRenderer>
        {data?.sourceRoleName ? <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${sourceBadgePosition.x}px, ${sourceBadgePosition.y + 16}px)`, pointerEvents: 'none' }}><span className={`rounded px-1 text-[10px] ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-600'}`}>{data.sourceRoleName}</span></div> : null}
        {data?.targetRoleName ? <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${targetBadgePosition.x}px, ${targetBadgePosition.y + 16}px)`, pointerEvents: 'none' }}><span className={`rounded px-1 text-[10px] ${isDark ? 'bg-slate-900 text-slate-300' : 'bg-white text-slate-600'}`}>{data.targetRoleName}</span></div> : null}
        {relationType === 'dependency' && (data?.stereotype === 'use' || data?.usage === 'enum') ? (
          <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px, ${(sourceY + targetY) / 2 - 12}px)`, pointerEvents: 'none' }}>
             <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${isDark ? 'border-teal-700 bg-slate-900 text-teal-300' : 'border-teal-200 bg-white text-teal-700'}`}>«use»</span>
          </div>
        ) : null}
        {UML_RELATION_CONFIG[relationType].hasMultiplicity && !data?.associationClassLink ? (
          <>
            <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${sourceBadgePosition.x}px, ${sourceBadgePosition.y}px)`, pointerEvents: 'auto' }}>
              <button
                type="button"
                className={`pointer-events-auto cursor-pointer px-1.5 py-0.5 text-[10px] font-mono rounded border shadow-sm transition-colors ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  data?.onEdit?.(id)
                }}
              >
                {sourceMultiplicity}
              </button>
            </div>
            <div style={{ position: 'absolute', transform: `translate(-50%, -50%) translate(${targetBadgePosition.x}px, ${targetBadgePosition.y}px)`, pointerEvents: 'auto' }}>
              <button
                type="button"
                className={`pointer-events-auto cursor-pointer px-1.5 py-0.5 text-[10px] font-mono rounded border shadow-sm transition-colors ${isDark ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}
                onClick={(event) => {
                  event.stopPropagation()
                  data?.onEdit?.(id)
                }}
              >
                {targetMultiplicity}
              </button>
            </div>
          </>
        ) : null}
      </EdgeLabelRenderer>
    </>
  )
}

const UmlNode = ({ id, data, selected }: NodeProps<Node<DiagramNodeData>>) => {
  const updateNodeInternals = useUpdateNodeInternals()
  const isDark = data.themeMode === 'dark'
  const border = selected ? (isDark ? '#93c5fd' : '#2563eb') : data.kind === 'interface' ? (isDark ? '#818cf8' : '#4f46e5') : data.kind === 'abstract' ? (isDark ? '#c084fc' : '#9333ea') : data.kind === 'enum' ? (isDark ? '#34d399' : '#059669') : (isDark ? '#818cf8' : '#6366f1')
  const remoteBorder = data.remoteSelectedColor ?? border
  const movingBorder = data.remoteMovingColor ?? border
  const headerBg = data.kind === 'interface' ? (isDark ? '#4338ca' : '#818cf8') : data.kind === 'abstract' ? (isDark ? '#2e1065' : '#faf5ff') : data.kind === 'enum' ? (isDark ? '#064e3b' : '#ecfdf5') : (isDark ? '#111827' : '#ffffff')
  const bodyBg = data.kind === 'interface' ? (isDark ? '#1e1b4b' : '#eef2ff') : (isDark ? '#0f172a' : '#ffffff')
  const textColor = data.kind === 'interface' ? '#ffffff' : isDark ? '#e2e8f0' : '#1e293b'
  const isRemotelySelected = Boolean(data.remoteSelectedColor)
  const isRemoteMoving = Boolean(data.remoteMovingColor) && !selected && !isRemotelySelected
  const handleStyle = { width: 6, height: 6, border: `1px solid ${border}`, background: 'transparent', borderRadius: 9999, opacity: 0 } as const
  const attributeLabels = data.attributes.map((attribute, index) => formatUmlAttributeLabel({ ...parseUmlAttribute(attribute), ...data.attributeSemantics?.[index] }))
  const methodLabels = data.methods.map((method, index) => formatUmlMethodLabel({ ...parseUmlMethod(method), ...data.methodSemantics?.[index] }))

  useEffect(() => {
    updateNodeInternals(id)
  }, [id, data.handleSlots, updateNodeInternals])
  const renderHandles = (type: 'source' | 'target') => (Object.entries(data.handleSlots?.[type] ?? { top: 1, right: 1, bottom: 1, left: 1 }) as Array<[HandleSide, number]>).flatMap(([side, count]) =>
    Array.from({ length: count }, (_, slot) => {
      const offset = `${((slot + 1) / (count + 1)) * 100}%`
      const position = { top: Position.Top, right: Position.Right, bottom: Position.Bottom, left: Position.Left }[side]
      const style = side === 'top' || side === 'bottom'
        ? { ...handleStyle, [side]: -6, left: offset }
        : { ...handleStyle, [side]: -6, top: offset }
      return <Handle key={`${type}-${side}-${slot}`} id={`${type}-${side}-${slot}`} type={type} position={position} style={style} />
    })
  )

  return (
    <div
      style={{
        width: NODE_WIDTH,
        border: `2px solid ${data.remoteSelectedColor ? remoteBorder : data.remoteMovingColor ? movingBorder : border}`,
        borderRadius: 12,
        overflow: 'hidden',
        background: bodyBg,
        cursor: 'pointer',
        boxShadow: selected
          ? (isDark
            ? '0 0 0 4px rgba(96,165,250,0.35), 0 14px 28px rgba(2,6,23,0.55)'
            : '0 0 0 4px rgba(37,99,235,0.25), 0 14px 28px rgba(15,23,42,0.16)')
          : data.remoteSelectedColor
            ? `0 0 0 3px ${data.remoteSelectedColor}22, 0 0 0 8px ${data.remoteSelectedColor}12, 0 10px 26px rgba(15,23,42,0.08)`
            : isRemoteMoving
              ? `0 0 0 3px ${data.remoteMovingColor}22, 0 0 0 8px ${data.remoteMovingColor}12, 0 10px 26px rgba(15,23,42,0.08)`
              : (isDark ? '0 8px 24px rgba(2,6,23,0.35)' : '0 8px 24px rgba(15,23,42,0.08)'),
        transform: selected || isRemoteMoving || Boolean(data.remoteSelectedColor) ? 'scale(1.015)' : 'scale(1)',
        transition: 'transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease',
        position: 'relative',
      }}
      onDoubleClick={() => { data.onEdit?.(id) }}
    >
      {renderHandles('target')}
       <div style={{ background: headerBg, color: textColor, padding: '10px 12px', fontFamily: 'JetBrains Mono', fontWeight: 600, fontSize: 12, textAlign: 'center', fontStyle: data.kind === 'abstract' ? 'italic' : undefined }}>
        {data.kind === 'interface' ? `<<interface>>\n${data.name}` : data.kind === 'abstract' ? `<<abstract>>\n${data.name}` : data.kind === 'enum' ? `<<enumeration>>\n${data.name}` : data.name}
      </div>
       {data.kind === 'enum' ? <div style={{ borderTop: `1px solid ${border}`, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 11, color: isDark ? '#a7f3d0' : '#065f46', minHeight: 36 }}>{data.literals.length ? data.literals.map((literal) => <div key={literal}>{literal}</div>) : <div className="opacity-60">No literals</div>}</div> : data.kind !== 'interface' ? <div style={{ borderTop: `1px solid ${border}`, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 11, color: isDark ? '#cbd5e1' : data.kind === 'abstract' ? '#581c87' : '#475569', minHeight: 36 }}>{attributeLabels.length ? attributeLabels.map((attribute, index) => <div key={`${attribute}-${index}`} style={{ textDecoration: data.attributeSemantics?.[index]?.isStatic ? 'underline' : undefined, fontStyle: data.attributeSemantics?.[index]?.isAbstract ? 'italic' : undefined }}>{attribute}</div>) : <div className="opacity-60">No attributes</div>}</div> : null}
       {data.kind !== 'enum' ? <div style={{ borderTop: `1px solid ${border}`, padding: '8px 12px', fontFamily: 'JetBrains Mono', fontSize: 11, color: isDark ? '#cbd5e1' : data.kind === 'interface' ? '#312e81' : data.kind === 'abstract' ? '#581c87' : '#475569', minHeight: 36 }}>{methodLabels.length ? methodLabels.map((method, index) => <div key={`${method}-${index}`} style={{ textDecoration: data.methodSemantics?.[index]?.isStatic ? 'underline' : undefined, fontStyle: data.methodSemantics?.[index]?.isAbstract ? 'italic' : undefined }}>{method}</div>) : <div className="opacity-60">No methods</div>}</div> : null}
      {renderHandles('source')}
    </div>
  )
}

const diagramCanvasStyle = `
.react-flow__node,
.react-flow__node * {
  cursor: pointer !important;
}

.react-flow__edge,
.react-flow__edge * {
  cursor: pointer !important;
}

.react-flow__minimap,
.react-flow__minimap svg,
.react-flow__minimap svg * {
  cursor: move !important;
}

.react-flow__minimap:active,
.react-flow__minimap:active svg,
.react-flow__minimap:active svg * {
  cursor: move !important;
}

.dark .react-flow__controls,
.dark .react-flow__minimap {
  background: hsl(var(--card)) !important;
  border-color: hsl(var(--border)) !important;
}

.dark .react-flow__controls-button {
  background: hsl(var(--card)) !important;
  color: hsl(var(--foreground)) !important;
  border-color: hsl(var(--border)) !important;
}

.dark .react-flow__controls-button:hover {
  background: hsl(var(--muted)) !important;
}

.dark .react-flow__minimap svg,
.dark .react-flow__minimap > svg {
  background: hsl(var(--card)) !important;
}
`

const nodeTypes = { umlNode: UmlNode }
const edgeTypes = { umlEdge: UmlEdge }
const ReactFlowCanvas = ReactFlow as unknown as any

interface DiagramPresenceLayerProps {
  users: CollaborationUser[]
  nodes: Array<Node<DiagramNodeData>>
  edges: Array<Edge<DiagramEdgeData>>
  onRemoteMotionChange: (state: Record<string, RemoteMotionState>) => void
}

const DiagramPresenceLayer = memo(({ users, nodes, edges, onRemoteMotionChange }: DiagramPresenceLayerProps) => {
  const reactFlow = useReactFlow()
  const [cursors, setCursors] = useState<Record<string, CollaborationCursor>>({})
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const remoteMotionSignatureRef = useRef('')

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  useEffect(() => {
    edgesRef.current = edges
  }, [edges])

  useEffect(() => {
    if (!AppConfig.COLLABORATION_ENABLED) return undefined

    const onCursorMoved = (payload?: any) => {
      if (!payload?.userId || !payload?.position) return
      const flowPosition = payload.position as { x: number; y: number }
      const nodeAttachment = getCursorAttachment(flowPosition, nodesRef.current)
      const edgeAttachment = nodeAttachment ? null : getEdgeCursorAttachment(flowPosition, edgesRef.current, nodesRef.current)
      const attachment = nodeAttachment ?? edgeAttachment
      setCursors((current) => ({
        ...current,
        [String(payload.userId)]: {
          ...(payload as CollaborationCursor),
          position: attachment?.point ?? flowPosition,
          attachedNodeId: nodeAttachment?.node.id,
          attachedElementId: nodeAttachment?.node.id ?? edgeAttachment?.edge.id,
        },
      }))
    }

    const onUserLeft = (payload?: any) => {
      const userId = String(payload?.user?.id ?? '')
      if (!userId) return
      setCursors((current) => {
        const next = { ...current }
        delete next[userId]
        return next
      })
    }

    socketManager.on('cursorMoved', onCursorMoved)
    socketManager.on('userLeft', onUserLeft)

    return () => {
      socketManager.off('cursorMoved', onCursorMoved)
      socketManager.off('userLeft', onUserLeft)
    }
  }, [])

  useEffect(() => {
    const activeIds = new Set(users.map((user) => String(user.id)))
    setCursors((current) => {
      const next = { ...current }
      Object.keys(next).forEach((userId) => {
        if (!activeIds.has(userId)) delete next[userId]
      })
      return next
    })
  }, [users])

  const cursorEntries = useMemo(() => Object.values(cursors), [cursors])

  useEffect(() => {
    const nextState: Record<string, RemoteMotionState> = {}
    cursorEntries.forEach((cursor) => {
      if (!cursor.attachedElementId) return
      const user = users.find((item) => item.id === cursor.userId) ?? null
      nextState[cursor.attachedElementId] = {
        color: getCollaboratorColor(cursor.userId),
        label: getCollaboratorLabel(user),
      }
    })
    const signature = Object.entries(nextState)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([nodeId, state]) => `${nodeId}:${state.color}:${state.label}`)
      .join('|')

    if (signature !== remoteMotionSignatureRef.current) {
      remoteMotionSignatureRef.current = signature
      onRemoteMotionChange(nextState)
    }
  }, [cursorEntries, onRemoteMotionChange, users])

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {cursorEntries.map((cursor) => {
        const user = users.find((item) => item.id === cursor.userId) ?? null
        const label = getCollaboratorLabel(user)
        const color = getCollaboratorColor(cursor.userId)
        const viewport = reactFlow.getViewport()
        const attachedNode = cursor.attachedElementId
          ? (nodes.find((node) => node.id === cursor.attachedElementId) ?? null)
          : null
        const attachedEdge = cursor.attachedElementId && !attachedNode
          ? (edges.find((edge) => edge.id === cursor.attachedElementId) ?? null)
          : null
        const attachmentPoint = attachedNode
          ? getNodeCursorAnchor(attachedNode)
          : attachedEdge
            ? getEdgeCursorAnchor(attachedEdge, nodes)
            : null
        const position = toCanvasPosition(attachmentPoint ?? cursor.position, viewport)

        return (
          <div
            key={cursor.userId}
            className="pointer-events-none absolute z-30"
            style={{
              transform: `translate(${position.x}px, ${position.y}px)`,
              transition: 'transform 80ms linear',
            }}
          >
            <div className="relative" style={{ transform: 'translate(-12px, -12px)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <MousePointer2
                  className="h-4 w-4 shrink-0"
                  style={{ color, transform: 'rotate(-18deg)' }}
                  aria-hidden="true"
                />
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderRadius: 9999,
                    background: color,
                    color: '#fff',
                    padding: '4px 10px',
                    boxShadow: `0 8px 20px ${color}33`,
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    fontWeight: 600,
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.16)',
                  }}
                >
                  {label}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
})

DiagramPresenceLayer.displayName = 'DiagramPresenceLayer'

interface DiagramCanvasSurfaceProps {
  users: CollaborationUser[]
  nodes: Array<Node<DiagramNodeData>>
  edges: Array<Edge<DiagramEdgeData>>
  flowNodes: Array<Node<DiagramNodeData>>
  flowEdges: Array<Edge<DiagramEdgeData>>
  themeMode: 'light' | 'dark'
  minimapProps: Record<string, unknown>
  exportTargetRef: RefObject<HTMLDivElement>
  onRemoteMotionChange: (state: Record<string, RemoteMotionState>) => void
  onNodesChange: ReturnType<typeof useNodesState<Node<DiagramNodeData>>>[2]
  onEdgesChange: ReturnType<typeof useEdgesState<Edge<DiagramEdgeData>>>[2]
  onConnect: (connection: Connection) => void
  onReconnect: (oldEdge: Edge<DiagramEdgeData>, connection: Connection) => void
  onNodeDrag: (_: React.MouseEvent, node: Node<DiagramNodeData>) => void
  onNodeDragStop: (_: React.MouseEvent, node: Node<DiagramNodeData>) => void
  onNodeClick: (_: React.MouseEvent, node: Node<DiagramNodeData>) => void
  onEdgeClick: (_: React.MouseEvent, edge: Edge<DiagramEdgeData>) => void
  onNodeDoubleClick: (_: React.MouseEvent, node: Node<DiagramNodeData>) => void
  onPaneClick: (event: React.MouseEvent) => void
}

export const DiagramCanvasSurface = memo(({
  users,
  nodes,
  edges,
  flowNodes,
  flowEdges,
  themeMode,
  minimapProps,
  exportTargetRef,
  onRemoteMotionChange,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onReconnect,
  onNodeDrag,
  onNodeDragStop,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onPaneClick,
}: DiagramCanvasSurfaceProps) => {
  const reactFlow = useReactFlow()

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>) => {
    if (!AppConfig.COLLABORATION_ENABLED || !socketManager.isSocketConnected()) return
    socketManager.moveCursor(
      reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
    )
  }, [reactFlow])

  return (
    <div
      className="relative min-w-0 overflow-hidden rounded-2xl bg-gradient-to-br from-background via-background to-muted/20"
      onMouseMove={handlePointerMove}
      onPointerMoveCapture={handlePointerMove}
    >
      <style>{diagramCanvasStyle}</style>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-sm">
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <DiagramPresenceLayer
            users={users}
            nodes={nodes}
            edges={edges}
            onRemoteMotionChange={onRemoteMotionChange}
          />
          <div ref={exportTargetRef} data-diagram-export-target="true" className="h-full min-h-0 w-full overflow-hidden bg-background">
            <ReactFlowCanvas
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              reconnectable={true}
              edgesReconnectable
              onReconnectEnd={() => undefined}
              connectionLineType={ConnectionLineType.SmoothStep}
              connectionLineStyle={{
                stroke: '#6366f1',
                strokeWidth: 2,
                strokeDasharray: '4 4'
              }}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onReconnect={onReconnect}
              onNodeDrag={onNodeDrag}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={onPaneClick}
              defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
              fitView
              minZoom={0.2}
              maxZoom={2.5}
            >
              <UmlMarkerDefs themeMode={themeMode} />
              <Background gap={20} size={1} />
              <Controls position="bottom-left" showZoom showFitView showInteractive={false} />
              <MiniMap
                position="bottom-right"
                zoomable
                pannable
                style={{ width: 180, height: 120, borderRadius: 12 }}
                {...minimapProps}
              />
            </ReactFlowCanvas>
          </div>
        </div>
      </div>
    </div>
  )
})

DiagramCanvasSurface.displayName = 'DiagramCanvasSurface'

import { useState, type RefObject } from 'react'
import { ArrowUpFromLine } from 'lucide-react'
import {
  Edge as FlowEdge,
  Node as FlowNode,
  getNodesBounds,
  getViewportForBounds,
  useReactFlow
} from '@xyflow/react'
import { toJpeg, toPng } from 'html-to-image'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'

type UmlKind = 'class' | 'interface' | 'abstract'
type UmlRelation =
  | 'association'
  | 'dependency'
  | 'inheritance'
  | 'implementation'
  | 'composition'
  | 'aggregation'

interface DiagramNodeData extends Record<string, unknown> {
  name: string
  kind: UmlKind
  attributes: string[]
  methods: string[]
}

interface DiagramEdgeData extends Record<string, unknown> {
  relationType: UmlRelation
  sourceMultiplicity: string
  targetMultiplicity: string
}

interface DiagramExportDropdownProps {
  diagramName?: string
  nodes: Array<FlowNode<DiagramNodeData>>
  edges: Array<FlowEdge<DiagramEdgeData>>
  exportTargetRef: RefObject<HTMLDivElement> // Referencia al contenedor de React Flow
}

const escapeXml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const visibility = (value: string) => value.startsWith('+') ? 'public' : value.startsWith('-') ? 'private' : value.startsWith('#') ? 'protected' : 'public'
const parseAttribute = (value: string) => {
  const match = value.trim().match(/^([+\-#~]?)([^:]+?)(?:\s*:\s*(.+?))?(?:\s*\[([^\]]+)\])?$/)
  return { visibility: visibility(match?.[1] ?? ''), name: (match?.[2] ?? value).trim(), type: match?.[3]?.trim(), multiplicity: match?.[4]?.trim() }
}
const parseMethod = (value: string) => {
  const match = value.trim().match(/^([+\-#~]?)([^(:]+)\((.*?)\)(?:\s*:\s*(.+))?$/)
  return { visibility: visibility(match?.[1] ?? ''), name: (match?.[2] ?? value).trim(), parameters: match?.[3] ?? '', returnType: match?.[4]?.trim() }
}
const multiplicityXml = (value: string | undefined, prefix: string) => {
  const [lower, upper] = (value || '1').split('..')
  return `<lowerValue xmi:type="uml:LiteralInteger" xmi:id="${prefix}-lower" value="${escapeXml(lower)}"/><upperValue xmi:type="uml:LiteralUnlimitedNatural" xmi:id="${prefix}-upper" value="${escapeXml(upper || lower)}"/>`
}

export const buildEnterpriseArchitectXmi = (
  diagramName: string,
  nodes: Array<FlowNode<DiagramNodeData>>,
  edges: Array<FlowEdge<DiagramEdgeData>>
) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]))
  const classifierReference = (value?: string) => {
    const candidate = value?.trim() ?? ''
    const byId = nodesById.get(candidate)
    if (byId) return byId.id
    return nodes.find((node) => node.data.name === candidate)?.id
  }
  const elements = nodes.map((node) => {
    const type = node.data.kind === 'interface' ? 'uml:Interface' : 'uml:Class'
    const attributes = node.data.attributes.map((value, index) => {
      const item = parseAttribute(value)
      const type = classifierReference(item.type)
      return `<ownedAttribute xmi:type="uml:Property" xmi:id="${escapeXml(`${node.id}-attribute-${index}`)}" name="${escapeXml(item.name)}" visibility="${item.visibility}"${type ? ` type="${escapeXml(type)}"` : ''}>${item.multiplicity ? multiplicityXml(item.multiplicity, `${node.id}-attribute-${index}`) : ''}</ownedAttribute>`
    }).join('')
    const methods = node.data.methods.map((value, index) => {
      const item = parseMethod(value)
      const parameters = item.parameters.split(',').map((parameter) => parameter.trim()).filter(Boolean).map((parameter, parameterIndex) => {
        const parsed = parseAttribute(parameter)
        const type = classifierReference(parsed.type)
        return `<ownedParameter xmi:type="uml:Parameter" xmi:id="${escapeXml(`${node.id}-method-${index}-parameter-${parameterIndex}`)}" name="${escapeXml(parsed.name)}"${type ? ` type="${escapeXml(type)}"` : ''}/>`
      }).join('')
      const returnType = classifierReference(item.returnType)
      const result = returnType ? `<ownedParameter xmi:type="uml:Parameter" xmi:id="${escapeXml(`${node.id}-method-${index}-return`)}" name="return" direction="return" type="${escapeXml(returnType)}"/>` : ''
      return `<ownedOperation xmi:type="uml:Operation" xmi:id="${escapeXml(`${node.id}-method-${index}`)}" name="${escapeXml(item.name)}" visibility="${item.visibility}">${parameters}${result}</ownedOperation>`
    }).join('')
    const ownedRelationships = edges.filter((edge) => edge.source === node.id && ['inheritance', 'implementation'].includes(edge.data?.relationType ?? '')).map((edge) => {
      const relationType = edge.data?.relationType
      return relationType === 'inheritance'
        ? `<generalization xmi:type="uml:Generalization" xmi:id="${escapeXml(edge.id)}" specific="${escapeXml(edge.source)}" general="${escapeXml(edge.target)}"/>`
        : `<interfaceRealization xmi:type="uml:InterfaceRealization" xmi:id="${escapeXml(edge.id)}" client="${escapeXml(edge.source)}" supplier="${escapeXml(edge.target)}" contract="${escapeXml(edge.target)}"/>`
    }).join('')
    return `<packagedElement xmi:type="${type}" xmi:id="${escapeXml(node.id)}" name="${escapeXml(node.data.name)}" visibility="public"${node.data.kind === 'abstract' ? ' isAbstract="true"' : ''}>${attributes}${methods}${ownedRelationships}</packagedElement>`
  }).join('')

  const relationships = edges.map((edge) => {
    const type = edge.data?.relationType ?? 'association'
    if (type === 'inheritance' || type === 'implementation') return ''
    if (type === 'dependency') return `<packagedElement xmi:type="uml:Dependency" xmi:id="${escapeXml(edge.id)}" client="${escapeXml(edge.source)}" supplier="${escapeXml(edge.target)}"/>`
    const sourceEnd = `${edge.id}-source`
    const targetEnd = `${edge.id}-target`
    const aggregation = type === 'composition' ? ' aggregation="composite"' : type === 'aggregation' ? ' aggregation="shared"' : ''
    return `<packagedElement xmi:type="uml:Association" xmi:id="${escapeXml(edge.id)}"><memberEnd xmi:idref="${escapeXml(sourceEnd)}"/><memberEnd xmi:idref="${escapeXml(targetEnd)}"/><ownedEnd xmi:type="uml:Property" xmi:id="${escapeXml(sourceEnd)}" type="${escapeXml(edge.source)}"${aggregation}>${multiplicityXml(edge.data?.sourceMultiplicity, sourceEnd)}</ownedEnd><ownedEnd xmi:type="uml:Property" xmi:id="${escapeXml(targetEnd)}" type="${escapeXml(edge.target)}">${multiplicityXml(edge.data?.targetMultiplicity, targetEnd)}</ownedEnd></packagedElement>`
  }).join('')

  const shapes = nodes.map((node) => `<ownedElement xmi:type="umldi:UMLClassifierShape" xmi:id="shape-${escapeXml(node.id)}" modelElement="${escapeXml(node.id)}"><bounds xmi:type="dc:Bounds" xmi:id="bounds-${escapeXml(node.id)}" x="${node.position.x}" y="${node.position.y}" width="260" height="${120 + Math.max(node.data.attributes.length, node.data.methods.length) * 20}"/></ownedElement>`).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmi:version="2.5.1" xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001" xmlns:umldi="http://www.omg.org/spec/UML/20131001/UMLDI" xmlns:dc="http://www.omg.org/spec/UML/20131001/UMLDC">
  <uml:Model xmi:type="uml:Model" xmi:id="model" name="${escapeXml(diagramName)}">${elements}${relationships}</uml:Model>
  <umldi:Diagram xmi:type="umldi:UMLClassDiagram" xmi:id="diagram" name="${escapeXml(diagramName)}" modelElement="model">${shapes}</umldi:Diagram>
</xmi:XMI>
`
}

export const DiagramExportDropdown = ({
  diagramName,
  nodes,
  edges,
  exportTargetRef,
}: DiagramExportDropdownProps) => {
  const [exporting, setExporting] = useState(false)
  const reactFlow = useReactFlow()
  const safeName = slugify(diagramName || 'diagrama') || 'diagrama'

  const downloadUrl = (url: string, extension: string) => {
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.${extension}`
    link.click()
  }

  const downloadBlob = (blob: Blob, extension: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${safeName}.${extension}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const exportImage = async (extension: 'png' | 'jpg') => {
    setExporting(true)
    try {
      const target = exportTargetRef.current
      if (!target) throw new Error('No se encontró el diagrama para exportar')

      await (document.fonts?.ready ?? Promise.resolve())

      const currentNodes = reactFlow.getNodes()
      if (currentNodes.length === 0) return

      // --- CORRECCIÓN CLAVE: Manipulación temporal del tamaño ---

      // 1. Guardar estilos originales del contenedor (target) y del viewport
      const originalTargetWidth = target.style.width
      const originalTargetHeight = target.style.height
      const viewport = target.querySelector(
        '.react-flow__viewport'
      ) as HTMLElement | null
      if (!viewport) throw new Error('No se encontró el viewport de React Flow')
      const originalViewportStyle = viewport.style.cssText

      // 2. Calcular límites totales y transformaciones
      const bounds = getNodesBounds(currentNodes)
      const zoom = getViewportForBounds(bounds, 1280, 1024, 0.5, 2, 0.1)

      // Definir márgenes (padding)
      const padding = 100
      const finalWidth = bounds.width + padding * 2
      const finalHeight = bounds.height + padding * 2

      // 3. Aplicar dimensiones totales AL CONTENEDOR (target)
      target.style.width = `${finalWidth}px`
      target.style.height = `${finalHeight}px`

      // 4. Aplicar transformación AL VIEWPORT para centrar el flujo dentro de las nuevas dimensiones
      viewport.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.zoom})`
      viewport.style.transformOrigin = 'top left'

      // 5. Configurar opciones de html-to-image
      const backgroundColor =
        window.getComputedStyle(target).backgroundColor || '#ffffff'
      const options = {
        cacheBust: true,
        backgroundColor,
        pixelRatio: 2, // Alta calidad
        // Importante: No forzar width/height aquí, que lo lea del DOM ya ajustado
        filter: (node: HTMLElement) => {
          const className = node.className
          if (typeof className === 'string') {
            return (
              !className.includes('react-flow__controls') &&
              !className.includes('react-flow__minimap') &&
              !className.includes('react-flow__panel')
            )
          }
          return true
        }
      }

      // 6. Exportar
      let dataUrl: string
      if (extension === 'jpg') {
        dataUrl = await toJpeg(target, options)
      } else {
        dataUrl = await toPng(target, options)
      }

      // 7. Restaurar estilos originales
      target.style.width = originalTargetWidth
      target.style.height = originalTargetHeight
      viewport.style.cssText = originalViewportStyle

      downloadUrl(dataUrl, extension)
    } catch (error) {
      console.error('Error al exportar la imagen:', error)
    } finally {
      setExporting(false)
    }
  }

  const exportEnterpriseArchitect = () => {
    const xml = buildEnterpriseArchitectXmi(
      diagramName || 'Diagrama',
      nodes,
      edges
    )
    downloadBlob(new Blob([xml], { type: 'application/xml' }), 'xmi')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 rounded-sm border-border/60 bg-background/80 px-2.5 shadow-sm"
          aria-label="Exportar diagrama"
        >
          <p className="text-md font-medium">Exportar</p>
          <ArrowUpFromLine className="h-4 w-4" /> 
          {/* <ChevronDown className="h-3.5 w-3.5 opacity-70" /> */}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-50">
        <DropdownMenuItem
          disabled={exporting}
          onClick={() => {
            void exportImage('png')
          }}
        >
          Exportar PNG
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exporting}
          onClick={() => {
            void exportImage('jpg')
          }}
        >
          Exportar JPG
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={exporting}
          onClick={exportEnterpriseArchitect}
        >
          Exportar XMI
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

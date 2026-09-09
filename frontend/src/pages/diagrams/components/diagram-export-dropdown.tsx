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

const buildEnterpriseArchitectXmi = (
  diagramName: string,
  nodes: Array<FlowNode<DiagramNodeData>>,
  edges: Array<FlowEdge<DiagramEdgeData>>
) => {
  const elements = nodes
    .map(
      (node) => `
    <element xmi.id="${escapeXml(node.id)}" name="${escapeXml(node.data.name)}" type="${node.data.kind === 'interface' ? 'Interface' : 'Class'}" stereotype="${node.data.kind === 'interface' ? 'interface' : node.data.kind === 'abstract' ? 'abstract' : 'class'}">
      <attributes>${node.data.attributes
        .map(
          (attribute, index) => `
        <attribute xmi.id="${escapeXml(`${node.id}-attr-${index}`)}" name="${escapeXml(attribute)}" />`
        )
        .join('')}</attributes>
      <methods>${node.data.methods
        .map(
          (method, index) => `
        <method xmi.id="${escapeXml(`${node.id}-method-${index}`)}" name="${escapeXml(method)}" />`
        )
        .join('')}</methods>
    </element>`
    )
    .join('')

  const connectors = edges
    .map(
      (edge) => `
    <connector xmi.id="${escapeXml(edge.id)}" type="${escapeXml(edge.data?.relationType ?? 'association')}" source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}" sourceMultiplicity="${escapeXml(edge.data?.sourceMultiplicity ?? '')}" targetMultiplicity="${escapeXml(edge.data?.targetMultiplicity ?? '')}" />`
    )
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<xmi:XMI xmlns:xmi="http://www.omg.org/spec/XMI/20131001" xmlns:uml="http://www.omg.org/spec/UML/20131001">
  <model name="${escapeXml(diagramName)}" type="uml:Model">
    <packagedElement name="${escapeXml(diagramName)}" type="uml:Package">
      ${elements}
      ${connectors}
    </packagedElement>
  </model>
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

import { Layers, Link2, Plus, Shapes, Workflow } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type Tool = 'select' | 'class' | 'interface' | 'abstract' | 'association' | 'dependency' | 'inheritance' | 'implementation' | 'composition' | 'aggregation'
type UmlKind = 'class' | 'interface' | 'abstract'

interface DiagramElementsSidebarProps {
  diagramName?: string | null
  diagramDescription?: string | null
  tool: Tool
  onAddNode: (kind: UmlKind) => void
  onToolChange: (tool: Tool) => void
}

const RELATION_LABELS: Record<Exclude<Tool, 'select' | 'class' | 'interface' | 'abstract'>, string> = {
  association: 'Asociación',
  dependency: 'Dependencia',
  inheritance: 'Herencia',
  implementation: 'Implementación',
  composition: 'Composición',
  aggregation: 'Agregación',
}

export const DiagramElementsSidebar = ({ diagramName, diagramDescription, tool, onAddNode, onToolChange }: DiagramElementsSidebarProps) => {
  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border bg-background">
      <div className="space-y-3 p-4">
        <div className="space-y-2 px-1 py-1">
          <div className="flex items-center gap-2 text-base font-medium text-foreground">
            <Layers className="h-4 w-4 text-muted-foreground" />
            {diagramName || 'Sin nombre'}
          </div>
          <p className="line-clamp-1 text-sm text-muted-foreground">
            {diagramDescription || 'Sin descripción'}
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex-1 overflow-hidden px-6 py-4">
        <div className="flex h-full flex-col gap-4 overflow-hidden">
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Shapes className="h-4 w-4 text-muted-foreground" />
              Elementos
            </h3>
            <div className="space-y-4">
              <Button
                size="sm"
                variant={tool === 'class' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => {
                  onToolChange('class')
                  onAddNode('class')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Clase
              </Button>
              <Button
                size="sm"
                variant={tool === 'interface' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => {
                  onToolChange('interface')
                  onAddNode('interface')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Interfaz
              </Button>
              <Button
                size="sm"
                variant={tool === 'abstract' ? 'default' : 'outline'}
                className="w-full justify-start"
                onClick={() => {
                  onToolChange('abstract')
                  onAddNode('abstract')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Clase abstracta
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Relaciones
            </h3>
            <div className="grid grid-cols-1 gap-4">
              {(['association', 'dependency', 'inheritance', 'implementation', 'composition', 'aggregation'] as const).map((relation) => (
                <Button
                  key={relation}
                  size="sm"
                  variant={tool === relation ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    onToolChange(tool === relation ? 'select' : relation)
                  }}
                >
                  <Workflow className="mr-2 h-4 w-4" />
                  {RELATION_LABELS[relation]}
                </Button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
}

import { Layers, Link2, Shapes } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'

type Tool = 'select' | 'class' | 'interface' | 'abstract' | 'enum' | 'association' | 'dependency' | 'enumUsage' | 'inheritance' | 'implementation' | 'composition' | 'aggregation'
type UmlKind = 'class' | 'interface' | 'abstract' | 'enum'

interface DiagramElementsSidebarProps {
  diagramName?: string | null
  diagramDescription?: string | null
  tool: Tool
  onAddNode: (kind: UmlKind) => void
  onToolChange: (tool: Tool) => void
}

const RELATION_LABELS: Record<Exclude<Tool, 'select' | 'class' | 'interface' | 'abstract' | 'enum'>, string> = {
  association: 'Asociación',
  dependency: 'Dependencia',
  enumUsage: 'Uso de enum',
  inheritance: 'Herencia',
  implementation: 'Implementación',
  composition: 'Composición',
  aggregation: 'Agregación',
}

const RELATIONS = ['association', 'dependency', 'enumUsage', 'inheritance', 'implementation', 'composition', 'aggregation'] as const

export const UmlElementPreview = ({ kind }: { kind: UmlKind }) => {
  const title = kind === 'enum' ? 'Status' : kind === 'interface' ? '«interface» Service' : kind === 'abstract' ? '«abstract» BaseEntity' : 'Customer'
  const details = kind === 'enum' ? ['ACTIVE', 'ARCHIVED'] : ['+ id: UUID', '+ save(): void']

  return (
    <span aria-hidden="true" className="w-20 shrink-0 overflow-hidden rounded border border-current/40 bg-background text-[7px] leading-3 text-foreground shadow-sm">
      <span className={`block border-b border-current/30 px-1 text-center font-semibold ${kind === 'abstract' ? 'italic' : ''}`}>{title}</span>
      {details.map((detail) => <span key={detail} className="block border-b border-current/20 px-1 last:border-b-0">{detail}</span>)}
    </span>
  )
}

export const UmlRelationPreview = ({ relation }: { relation: typeof RELATIONS[number] }) => {
  const dashed = relation === 'dependency' || relation === 'enumUsage' || relation === 'implementation'
  const triangle = relation === 'inheritance' || relation === 'implementation'
  const arrow = relation === 'dependency' || relation === 'enumUsage'
  const diamond = relation === 'composition' || relation === 'aggregation'

  return (
    <svg aria-hidden="true" className="h-5 w-20 shrink-0 text-foreground" viewBox="0 0 80 20" fill="none">
      <line x1="12" y1="10" x2="68" y2="10" stroke="currentColor" strokeWidth="1.75" strokeDasharray={dashed ? '6 4' : undefined} strokeLinecap="round" />
      {triangle ? <path d="M 68 4 L 76 10 L 68 16 Z" fill="hsl(var(--background))" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /> : null}
      {arrow ? <path d="M 68 5 L 76 10 L 68 15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" /> : null}
      {diamond ? <path d="M 4 10 L 10 4 L 16 10 L 10 16 Z" fill={relation === 'composition' ? 'currentColor' : 'hsl(var(--background))'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /> : null}
    </svg>
  )
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

      <div className="flex-1 overflow-y-auto px-6 py-4">
        <div className="flex flex-col gap-4 pb-4">
          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Shapes className="h-4 w-4 text-muted-foreground" />
              Elementos
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {([['class', 'Clase'], ['enum', 'Enum'], ['interface', 'Interfaz'], ['abstract', 'Clase abstracta']] as const).map(([kind, label]) => (
                <Button key={kind} size="sm" variant={tool === kind ? 'default' : 'outline'} aria-label={label} className="h-auto w-full justify-center px-2 py-2" onClick={() => {
                  onToolChange(kind)
                  onAddNode(kind)
                }}>
                  <UmlElementPreview kind={kind} />
                </Button>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Link2 className="h-4 w-4 text-muted-foreground" />
              Relaciones
            </h3>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {RELATIONS.map((relation) => (
                <Button
                  key={relation}
                  size="sm"
                  variant={tool === relation ? 'default' : 'outline'}
                  aria-label={RELATION_LABELS[relation]}
                  className="h-auto w-full justify-center px-2 py-2"
                  onClick={() => {
                    onToolChange(tool === relation ? 'select' : relation)
                  }}
                >
                  <UmlRelationPreview relation={relation} />
                </Button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </aside>
  )
}
